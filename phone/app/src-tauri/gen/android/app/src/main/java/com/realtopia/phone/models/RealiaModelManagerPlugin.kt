package com.realtopia.phone.models

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Collections
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class OpenRepositoryArgs {
  lateinit var modelId: String
}

@InvokeArg
class StartModelDownloadArgs {
  lateinit var modelId: String
}

private data class ModelSpec(
  val id: String,
  val label: String,
  val automatic: Boolean,
)

private data class RepoFile(val path: String, val size: Long, val sha256: String)
private data class DownloadSnapshot(val status: Int, val downloadedBytes: Long)

/**
 * Keeps all large MNN snapshots outside the APK. ASR and the scene-observation
 * 2B VL model are scheduled automatically
 * on a validated network; Qwen3-VL variants are installed only after an explicit
 * user action. DownloadManager owns the transfers so they survive process restarts.
 */
@TauriPlugin
class RealiaModelManagerPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val scheduling = Collections.synchronizedSet(mutableSetOf<String>())
  private val connectivity =
    activity.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val downloads = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  private val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = scheduleWhenInternetIsValidated()

    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
      if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
        scheduleModel(MODELS.getValue(ASR_MODEL_ID))
      }
    }
  }

  init {
    try {
      connectivity.registerDefaultNetworkCallback(networkCallback)
      scheduleWhenInternetIsValidated()
    } catch (error: Exception) {
      setLastError(ASR_MODEL_ID, error.message ?: error.javaClass.simpleName)
      Log.e(TAG, "could not register network callback", error)
    }
  }

  /** Backward-compatible single-ASR status used by older WebView bundles. */
  @Command
  fun status(invoke: Invoke) {
    worker.execute { resolveStatus(invoke, MODELS.getValue(ASR_MODEL_ID)) }
  }

  @Command
  fun allStatuses(invoke: Invoke) {
    worker.execute {
      try {
        val values = JSONArray()
        MODELS.values.forEach { values.put(buildStatus(it)) }
        invoke.resolve(JSObject().put("models", values))
      } catch (error: Exception) {
        invoke.reject("model status failed: ${error.message ?: error.javaClass.simpleName}")
      }
    }
  }

  /** Backward-compatible ASR download command. */
  @Command
  fun startAsrDownload(invoke: Invoke) {
    startDownload(invoke, ASR_MODEL_ID)
  }

  @Command
  fun startModelDownload(invoke: Invoke) {
    val args = invoke.parseArgs(StartModelDownloadArgs::class.java)
    startDownload(invoke, args.modelId)
  }

  @Command
  fun openRepository(invoke: Invoke) {
    val args = invoke.parseArgs(OpenRepositoryArgs::class.java)
    val repositoryUrl = REPOSITORIES[args.modelId]
    if (repositoryUrl == null) {
      invoke.reject("unknown model repository")
      return
    }
    try {
      activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(repositoryUrl)))
      invoke.resolve(JSObject().put("accepted", true))
    } catch (error: Exception) {
      invoke.reject("cannot open ModelScope: ${error.message ?: error.javaClass.simpleName}")
    }
  }

  private fun resolveStatus(invoke: Invoke, model: ModelSpec) {
    try {
      invoke.resolve(buildStatus(model))
    } catch (error: Exception) {
      invoke.reject("model status failed: ${error.message ?: error.javaClass.simpleName}")
    }
  }

  private fun startDownload(invoke: Invoke, modelId: String) {
    val model = MODELS[modelId]
    if (model == null) {
      invoke.reject("这个模型目前只提供仓库链接，尚无应用内推理链路")
      return
    }
    if (!hasValidatedInternet()) {
      invoke.reject("当前没有可访问互联网的网络")
      return
    }
    scheduleModel(model)
    invoke.resolve(JSObject().put("accepted", true))
  }

  private fun scheduleWhenInternetIsValidated() {
    if (hasValidatedInternet()) scheduleModel(MODELS.getValue(ASR_MODEL_ID))
  }

  private fun hasValidatedInternet(): Boolean {
    val network = connectivity.activeNetwork ?: return false
    val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }

  private fun scheduleModel(model: ModelSpec) {
    if (!scheduling.add(model.id)) return
    worker.execute {
      try {
        setLastError(model.id, null)
        val files = fetchCatalog(model)
        saveCatalog(model.id, files)
        var queued = 0
        files.forEach { if (ensureQueued(model, it)) queued++ }
        Log.i(TAG, "${model.id} checked: ${files.size} files, $queued queued")
      } catch (error: Exception) {
        setLastError(model.id, error.message ?: error.javaClass.simpleName)
        Log.e(TAG, "${model.id} snapshot scheduling failed", error)
      } finally {
        scheduling.remove(model.id)
      }
    }
  }

  private fun fetchCatalog(model: ModelSpec): List<RepoFile> {
    val connection = URL(filesUrl(model.id)).openConnection() as HttpURLConnection
    connection.connectTimeout = 15_000
    connection.readTimeout = 30_000
    connection.setRequestProperty("User-Agent", USER_AGENT)
    try {
      require(connection.responseCode in 200..299) {
        "ModelScope file list HTTP ${connection.responseCode}"
      }
      val root = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
      require(root.optBoolean("Success")) {
        root.optString("Message", "ModelScope file list failed")
      }
      val remoteFiles = root.getJSONObject("Data").getJSONArray("Files")
      val result = ArrayList<RepoFile>(remoteFiles.length())
      for (index in 0 until remoteFiles.length()) {
        val value = remoteFiles.getJSONObject(index)
        if (value.optString("Type") != "blob") continue
        val path = value.getString("Path")
        if (path == ".gitattributes") continue
        val size = value.getLong("Size")
        require(path.isNotBlank() && size >= 0 && !path.startsWith("/") && !path.contains("..")) {
          "unsafe ModelScope path"
        }
        result += RepoFile(path, size, value.optString("Sha256"))
      }
      require(result.isNotEmpty()) { "ModelScope returned an empty snapshot" }
      require(result.any { it.path == "config.json" }) { "snapshot has no config.json" }
      if (model.id in VL_MODEL_IDS) {
        REQUIRED_VL_FILES.forEach { required ->
          require(result.any { it.path == required }) { "snapshot has no $required" }
        }
      }
      return result
    } finally {
      connection.disconnect()
    }
  }

  private fun ensureQueued(model: ModelSpec, file: RepoFile): Boolean {
    val destination = modelRoot(model.id).resolve(file.path)
    val key = downloadKey(model.id, file.path)
    val existingId = preferences.getLong(key, -1L)
    val snapshot = queryDownload(existingId)
    if (
      snapshot?.status == DownloadManager.STATUS_PENDING ||
        snapshot?.status == DownloadManager.STATUS_RUNNING ||
        snapshot?.status == DownloadManager.STATUS_PAUSED
    ) return false
    if (destination.isFile && destination.length() == file.size && isVerified(model.id, file, destination)) {
      return false
    }
    if (existingId >= 0) downloads.remove(existingId)
    if (destination.exists() && !destination.delete()) {
      throw IllegalStateException("cannot replace incomplete model file ${file.path}")
    }
    preferences.edit().remove(verifiedKey(model.id, file.path)).apply()
    destination.parentFile?.mkdirs()
    val request = DownloadManager.Request(Uri.parse(downloadUrl(model.id, file.path)))
      .setTitle("RealTopia ${model.label}")
      .setDescription(file.path)
      .setAllowedOverMetered(true)
      .setAllowedOverRoaming(false)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationInExternalFilesDir(activity, null, "models/${model.id}/${file.path}")
    val downloadId = downloads.enqueue(request)
    preferences.edit().putLong(key, downloadId).apply()
    return true
  }

  private fun queryDownload(downloadId: Long): DownloadSnapshot? {
    if (downloadId < 0) return null
    downloads.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
      if (!cursor.moveToFirst()) return null
      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val bytes = cursor.getLong(
        cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
      )
      return DownloadSnapshot(status, bytes.coerceAtLeast(0L))
    }
  }

  private fun buildStatus(model: ModelSpec): JSObject {
    val files = loadCatalog(model.id)
    var expectedBytes = 0L
    var downloadedBytes = 0L
    var completedFiles = 0
    var activeDownloads = 0
    var failedDownloads = 0
    var retryNeeded = false
    files.forEach { file ->
      expectedBytes += file.size
      val destination = modelRoot(model.id).resolve(file.path)
      val id = preferences.getLong(downloadKey(model.id, file.path), -1L)
      val snapshot = queryDownload(id)
      val sizeMatches = destination.isFile && destination.length() == file.size
      val alreadyVerified = sizeMatches &&
        preferences.getString(verifiedKey(model.id, file.path), null) == file.sha256
      if (alreadyVerified) {
        downloadedBytes += file.size
        completedFiles++
      } else {
        when (snapshot?.status) {
          DownloadManager.STATUS_SUCCESSFUL -> {
            if (sizeMatches && isVerified(model.id, file, destination)) {
              downloadedBytes += file.size
              completedFiles++
            } else {
              failedDownloads++
              retryNeeded = true
              setLastError(model.id, "${file.path} 完整性校验失败，正在重新下载")
            }
          }
          DownloadManager.STATUS_FAILED -> {
            downloadedBytes += snapshot.downloadedBytes.coerceIn(0L, file.size)
            failedDownloads++
            retryNeeded = true
          }
          DownloadManager.STATUS_PENDING,
          DownloadManager.STATUS_RUNNING,
          DownloadManager.STATUS_PAUSED,
          -> {
            downloadedBytes += snapshot.downloadedBytes.coerceIn(0L, file.size)
            activeDownloads++
          }
          else -> {
            if (sizeMatches && isVerified(model.id, file, destination)) {
              downloadedBytes += file.size
              completedFiles++
            } else if (destination.exists() || id >= 0) {
              failedDownloads++
              retryNeeded = true
            }
          }
        }
      }
    }
    if (retryNeeded && hasValidatedInternet()) scheduleModel(model)
    val ready = files.isNotEmpty() && completedFiles == files.size
    val lastError = preferences.getString(lastErrorKey(model.id), null)
    val state = when {
      ready -> "ready"
      failedDownloads > 0 || lastError != null -> "error"
      scheduling.contains(model.id) -> "checking"
      activeDownloads > 0 -> "downloading"
      files.isEmpty() && !model.automatic -> "not_installed"
      !hasValidatedInternet() -> "waiting_network"
      files.isEmpty() -> "checking"
      else -> "queued"
    }
    return JSObject().apply {
      put("model_id", model.id)
      put("repository_url", REPOSITORIES.getValue(model.id))
      put("state", state)
      put("ready", ready)
      put("automatic", model.automatic)
      put("downloaded_bytes", downloadedBytes)
      put("total_bytes", expectedBytes)
      put("completed_files", completedFiles)
      put("file_count", files.size)
      put("install_path", modelRoot(model.id).absolutePath)
      put("last_error", lastError)
    }
  }

  private fun modelRoot(modelId: String): File =
    File(activity.getExternalFilesDir(null), "models/$modelId").apply { mkdirs() }

  private fun filesUrl(modelId: String) =
    "https://modelscope.cn/api/v1/models/$modelId/repo/files?Recursive=true"

  private fun downloadUrl(modelId: String, path: String): String {
    val encoded = path.split('/').joinToString("/") { Uri.encode(it) }
    return "https://modelscope.cn/models/$modelId/resolve/master/$encoded"
  }

  private fun namespaced(modelId: String, path: String) =
    MessageDigest.getInstance("SHA-256")
      .digest("$modelId/$path".toByteArray())
      .take(12)
      .joinToString("") { "%02x".format(it) }

  private fun downloadKey(modelId: String, path: String) = "download.${namespaced(modelId, path)}"
  private fun verifiedKey(modelId: String, path: String) = "verified.${namespaced(modelId, path)}"
  private fun catalogKey(modelId: String) = "catalog.${namespaced(modelId, "catalog")}"
  private fun lastErrorKey(modelId: String) = "error.${namespaced(modelId, "error")}"

  private fun isVerified(modelId: String, file: RepoFile, destination: File): Boolean {
    if (!destination.isFile || destination.length() != file.size) return false
    if (file.sha256.isBlank()) return true
    if (preferences.getString(verifiedKey(modelId, file.path), null) == file.sha256) return true
    val digest = MessageDigest.getInstance("SHA-256")
    destination.inputStream().buffered(1024 * 1024).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    val valid = actual.equals(file.sha256, ignoreCase = true)
    if (valid) {
      preferences.edit().putString(verifiedKey(modelId, file.path), file.sha256).apply()
    } else {
      Log.e(TAG, "checksum mismatch for $modelId/${file.path}")
    }
    return valid
  }

  private fun saveCatalog(modelId: String, files: List<RepoFile>) {
    val array = JSONArray()
    files.forEach { file ->
      array.put(JSONObject().put("path", file.path).put("size", file.size).put("sha256", file.sha256))
    }
    preferences.edit().putString(catalogKey(modelId), array.toString()).apply()
  }

  private fun loadCatalog(modelId: String): List<RepoFile> {
    val raw = preferences.getString(catalogKey(modelId), null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).map { index ->
        val value = array.getJSONObject(index)
        RepoFile(value.getString("path"), value.getLong("size"), value.optString("sha256"))
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun setLastError(modelId: String, value: String?) {
    preferences.edit().apply {
      if (value == null) remove(lastErrorKey(modelId)) else putString(lastErrorKey(modelId), value)
    }.apply()
  }

  override fun onDestroy(activity: AppCompatActivity) {
    try {
      connectivity.unregisterNetworkCallback(networkCallback)
    } catch (_: Exception) {
      // The callback may already have been unregistered by Android.
    }
    worker.shutdown()
  }

  companion object {
    private const val TAG = "RealTopiaModels"
    private const val PREFERENCES = "realtopia.model.downloads.v2"
    private const val ASR_MODEL_ID = "huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN"
    private const val VL_2B_MODEL_ID = "MNN/Qwen3-VL-2B-Instruct-MNN"
    private const val VL_4B_MODEL_ID = "MNN/Qwen3-VL-4B-Instruct-MNN"
    private const val USER_AGENT = "RealTopia-Android/0.2 ModelScopeDownloader"
    private val VL_MODEL_IDS = setOf(VL_2B_MODEL_ID, VL_4B_MODEL_ID)
    private val REQUIRED_VL_FILES = arrayOf(
      "config.json", "llm_config.json", "tokenizer.txt", "llm.mnn", "llm.mnn.weight",
      "visual.mnn", "visual.mnn.weight",
    )
    private val MODELS = linkedMapOf(
      ASR_MODEL_ID to ModelSpec(ASR_MODEL_ID, "本地语音模型", true),
      VL_2B_MODEL_ID to ModelSpec(VL_2B_MODEL_ID, "Qwen3-VL 2B", true),
      VL_4B_MODEL_ID to ModelSpec(VL_4B_MODEL_ID, "Qwen3-VL 4B", false),
    )
    private val REPOSITORIES = mapOf(
      ASR_MODEL_ID to "https://modelscope.cn/models/$ASR_MODEL_ID/",
      "MNN/Qwen3-1.7B-MNN" to "https://modelscope.cn/models/MNN/Qwen3-1.7B-MNN",
      VL_2B_MODEL_ID to "https://modelscope.cn/models/$VL_2B_MODEL_ID",
      VL_4B_MODEL_ID to "https://modelscope.cn/models/$VL_4B_MODEL_ID",
      "huangzhengxiang/Qwen3-TTS-0.6B-Base-FP16-MNN" to
        "https://modelscope.cn/models/huangzhengxiang/Qwen3-TTS-0.6B-Base-FP16-MNN",
    )
  }
}
