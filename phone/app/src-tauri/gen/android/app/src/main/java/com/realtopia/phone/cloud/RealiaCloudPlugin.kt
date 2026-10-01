package com.realtopia.phone.cloud

import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class SaveCloudConfigArgs {
  lateinit var provider: String
  lateinit var baseUrl: String
  lateinit var model: String
  lateinit var sttModel: String
  var apiKey: String? = null
}

@InvokeArg
class CloudCompleteArgs {
  lateinit var prompt: String
  var system: String? = null
  var json: Boolean = false
}

/**
 * OpenAI-compatible cloud gateway. The API key is encrypted with an
 * AndroidKeyStore AES/GCM key and never returned to Rust or the WebView.
 */
@TauriPlugin
class RealiaCloudPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @Command
  fun config(invoke: Invoke) = invoke.resolve(configResponse())

  @Command
  fun saveConfig(invoke: Invoke) {
    val args = invoke.parseArgs(SaveCloudConfigArgs::class.java)
    worker.execute {
      try {
        val baseUrl = validateBaseUrl(args.baseUrl)
        val provider = args.provider.trim().ifEmpty { DEFAULT_PROVIDER }
        val model = args.model.trim().ifEmpty { DEFAULT_MODEL }
        val sttModel = args.sttModel.trim().ifEmpty { DEFAULT_STT_MODEL }
        val newKey = args.apiKey?.trim().orEmpty()
        if (newKey.isNotEmpty()) storeApiKey(newKey)
        preferences.edit()
          .putString(KEY_PROVIDER, provider)
          .putString(KEY_BASE_URL, baseUrl)
          .putString(KEY_MODEL, model)
          .putString(KEY_STT_MODEL, sttModel)
          .apply()
        invoke.resolve(configResponse())
      } catch (error: Exception) {
        invoke.reject("secure cloud configuration failed: ${safeError(error)}")
      }
    }
  }

  @Command
  fun clearApiKey(invoke: Invoke) {
    preferences.edit().remove(KEY_ENCRYPTED_API_KEY).remove(KEY_API_KEY_IV).apply()
    invoke.resolve(configResponse())
  }

  @Command
  fun complete(invoke: Invoke) {
    val args = invoke.parseArgs(CloudCompleteArgs::class.java)
    worker.execute {
      try {
        require(args.prompt.isNotBlank() && args.prompt.length <= MAX_PROMPT_CHARS) {
          "prompt is empty or too large"
        }
        val started = android.os.SystemClock.elapsedRealtime()
        val model = preferences.getString(KEY_MODEL, DEFAULT_MODEL) ?: DEFAULT_MODEL
        val body = JSONObject().apply {
          put("model", model)
          put("messages", JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", args.system ?: DEFAULT_SYSTEM))
            put(JSONObject().put("role", "user").put("content", args.prompt))
          })
          put("temperature", 0.2)
          if (args.json) put("response_format", JSONObject().put("type", "json_object"))
        }
        val response = postJson("chat/completions", body)
        val content = response.optJSONArray("choices")
          ?.optJSONObject(0)?.optJSONObject("message")?.optString("content")?.trim().orEmpty()
        require(content.isNotEmpty()) { "cloud model returned empty content" }
        invoke.resolve(JSObject().apply {
          put("text", content)
          put("provider", preferences.getString(KEY_PROVIDER, DEFAULT_PROVIDER))
          put("model", response.optString("model", model))
          put("side", "cloud")
          put("latency_ms", android.os.SystemClock.elapsedRealtime() - started)
        })
      } catch (error: Exception) {
        // Never include request headers, response bodies, or the decrypted key.
        invoke.reject("cloud completion failed: ${safeError(error)}")
      }
    }
  }

  private fun postJson(relativePath: String, body: JSONObject): JSONObject {
    val apiKey = loadApiKey() ?: throw IllegalStateException("API Key 尚未安全配置")
    val baseUrl = validateBaseUrl(
      preferences.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL,
    )
    val connection = URL("${baseUrl.trimEnd('/')}/$relativePath").openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 20_000
    connection.readTimeout = 120_000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.setRequestProperty("Authorization", "Bearer $apiKey")
    connection.setRequestProperty("Accept", "application/json")
    try {
      connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      if (status !in 200..299) throw IllegalStateException("HTTP $status")
      val responseText = connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
        val value = reader.readText()
        require(value.length <= MAX_RESPONSE_CHARS) { "response is too large" }
        value
      }
      return JSONObject(responseText)
    } finally {
      connection.disconnect()
    }
  }

  private fun configResponse() = JSObject().apply {
    put("provider", preferences.getString(KEY_PROVIDER, DEFAULT_PROVIDER))
    put("base_url", preferences.getString(KEY_BASE_URL, DEFAULT_BASE_URL))
    put("model", preferences.getString(KEY_MODEL, DEFAULT_MODEL))
    put("stt_model", preferences.getString(KEY_STT_MODEL, DEFAULT_STT_MODEL))
    put("has_api_key", preferences.contains(KEY_ENCRYPTED_API_KEY))
  }

  private fun validateBaseUrl(value: String): String {
    val url = URL(value.trim().trimEnd('/'))
    require(url.protocol == "https" && url.host.isNotBlank() && url.userInfo == null) {
      "Base URL 必须是没有内嵌凭据的 HTTPS 地址"
    }
    return url.toString().trimEnd('/')
  }

  private fun storeApiKey(apiKey: String) {
    require(apiKey.length in 16..512 && !apiKey.any(Char::isWhitespace)) { "API Key 格式无效" }
    val cipher = Cipher.getInstance(CIPHER)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))
    preferences.edit()
      .putString(KEY_ENCRYPTED_API_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .putString(KEY_API_KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .apply()
  }

  private fun loadApiKey(): String? {
    val encrypted = preferences.getString(KEY_ENCRYPTED_API_KEY, null) ?: return null
    val iv = preferences.getString(KEY_API_KEY_IV, null) ?: return null
    val cipher = Cipher.getInstance(CIPHER)
    cipher.init(
      Cipher.DECRYPT_MODE,
      secretKey(),
      GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
    )
    return String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
  }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun safeError(error: Exception): String = when (error) {
    is java.net.SocketTimeoutException -> "请求超时"
    is java.net.UnknownHostException -> "无法解析服务地址"
    is javax.net.ssl.SSLException -> "TLS 验证失败"
    is IllegalArgumentException, is IllegalStateException -> error.message ?: "请求无效"
    else -> error.javaClass.simpleName
  }

  companion object {
    private const val PREFERENCES = "realtopia_secure_cloud_v1"
    private const val KEY_ALIAS = "realtopia.cloud.api-key.v1"
    private const val CIPHER = "AES/GCM/NoPadding"
    private const val KEY_ENCRYPTED_API_KEY = "api_key_ciphertext"
    private const val KEY_API_KEY_IV = "api_key_iv"
    private const val KEY_PROVIDER = "provider"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_MODEL = "model"
    private const val KEY_STT_MODEL = "stt_model"
    private const val DEFAULT_PROVIDER = "阿里云百炼 · OpenAI Compatible"
    private const val DEFAULT_BASE_URL =
      "https://llm-91vwfbm1df53hn0g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    private const val DEFAULT_MODEL = "qwen-plus"
    private const val DEFAULT_STT_MODEL = "qwen3-asr-flash"
    private const val DEFAULT_SYSTEM = "You are RealTopia's planning engine."
    private const val MAX_PROMPT_CHARS = 64_000
    private const val MAX_RESPONSE_CHARS = 4 * 1024 * 1024
  }
}
