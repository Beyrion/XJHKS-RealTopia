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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class OpenRepositoryArgs {
  lateinit var modelId: String
}

private data class RepoFile(val path: String, val size: Long, val sha256: String)
private data class DownloadSnapshot(val status: Int, val downloadedBytes: Long)

/**
 * Keeps large optional MNN models out of the APK. The ASR snapshot is queued in
 * Android's DownloadManager on the first validated internet connection, so the
 * transfer survives activity/process restarts and can resume after a network loss.
 */
@TauriPlugin
class RealiaModelManagerPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val scheduling = AtomicBoolean(false)
  private val connectivity = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val downloads = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  private val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = scheduleWhenInternetIsValidated()
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
      if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) scheduleAsr()
    }
  }

  init {
    try {
      connectivity.registerDefaultNetworkCallback(networkCallback)
      scheduleWhenInternetIsValidated()
    } catch (error: Exception) {
      setLastError(error.message ?: error.javaClass.simpleName)
      Log.e(TAG, "could not register network callback", error)
    }
  }

  @Command
  fun status(invoke: Invoke) {
    worker.execute {
      try {
        invoke.resolve(buildStatus())
      } catch (error: Exception) {
        invoke.reject("model status failed: ${error.message ?: error.javaClass.simpleName}")
      }
    }
  }

  @Command
  fun startAsrDownload(invoke: Invoke) {
    if (!hasValidatedInternet()) {
      invoke.reject("当前没有可访问互联网的网络，联网后会自动下载")
      return
    }
    scheduleAsr()
    invoke.resolve(JSObject().put("accepted", true))
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

  private fun scheduleWhenInternetIsValidated() {
    if (hasValidatedInternet()) scheduleAsr()
  }

  private fun hasValidatedInternet(): Boolean {
    val network = connectivity.activeNetwork ?: return false
    val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }

  private fun scheduleAsr() {
    if (!scheduling.compareAndSet(false, true)) return
    worker.execute {
      try {
        setLastError(null)
        val files = fetchAsrCatalog()
        saveCatalog(files)
        var queued = 0
        for (file in files) if (ensureQueued(file)) queued++
        Log.i(TAG, "ASR snapshot checked: ${files.size} files, $queued queued")
      } catch (error: Exception) {
        setLastError(error.message ?: error.javaClass.simpleName)
        Log.e(TAG, "ASR snapshot scheduling failed", error)
      } finally {
        scheduling.set(false)
      }
    }
  }

  private fun fetchAsrCatalog(): List<RepoFile> {
    val connection = URL(ASR_FILES_URL).openConnection() as HttpURLConnection
    connection.connectTimeout = 15_000
    connection.readTimeout = 30_000
    connection.setRequestProperty("User-Agent", USER_AGENT)
    try {
      require(connection.responseCode in 200..299) { "ModelScope file list HTTP ${connection.responseCode}" }
      val root = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
      require(root.optBoolean("Success")) { root.optString("Message", "ModelScope file list failed") }
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
      require(result.isNotEmpty()) { "ModelScope returned an empty ASR snapshot" }
      return result
    } finally {
      connection.disconnect()
    }
  }

  private fun ensureQueued(file: RepoFile): Boolean {
    val destination = modelRoot().resolve(file.path)
    val key = downloadKey(file.path)
    val existingId = preferences.getLong(key, -1L)
    val snapshot = queryDownload(existingId)
    if (snapshot?.status == DownloadManager.STATUS_PENDING ||
      snapshot?.status == DownloadManager.STATUS_RUNNING ||
      snapshot?.status == DownloadManager.STATUS_PAUSED) return false
    if (destination.isFile && destination.length() == file.size && isVerified(file, destination)) return false
    if (existingId >= 0) downloads.remove(existingId)
    if (destination.exists() && !destination.delete()) {
      throw IllegalStateException("cannot replace incomplete model file ${file.path}")
    }
    preferences.edit().remove(verifiedKey(file.path)).apply()
    destination.parentFile?.mkdirs()
    val request = DownloadManager.Request(Uri.parse(downloadUrl(file.path)))
      .setTitle("RealTopia 本地语音模型")
      .setDescription(file.path)
      .setAllowedOverMetered(true)
      .setAllowedOverRoaming(false)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationInExternalFilesDir(activity, null, "$MODEL_RELATIVE_ROOT/${file.path}")
    val downloadId = downloads.enqueue(request)
    preferences.edit().putLong(key, downloadId).apply()
    return true
  }

  private fun queryDownload(downloadId: Long): DownloadSnapshot? {
    if (downloadId < 0) return null
    downloads.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
      if (!cursor.moveToFirst()) return null
      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      return DownloadSnapshot(status, bytes.coerceAtLeast(0L))
    }
  }

  private fun buildStatus(): JSObject {
    val files = loadCatalog()
    var expectedBytes = 0L
    var downloadedBytes = 0L
    var completedFiles = 0
    var activeDownloads = 0
    var failedDownloads = 0
    var retryNeeded = false
    for (file in files) {
      expectedBytes += file.size
      val destination = modelRoot().resolve(file.path)
      val id = preferences.getLong(downloadKey(file.path), -1L)
      val snapshot = queryDownload(id)
      val sizeMatches = destination.isFile && destination.length() == file.size
      val alreadyVerified = sizeMatches && preferences.getString(verifiedKey(file.path), null) == file.sha256
      if (alreadyVerified) {
        downloadedBytes += file.size
        completedFiles++
        continue
      }
      when (snapshot?.status) {
        DownloadManager.STATUS_SUCCESSFUL -> {
          if (sizeMatches && isVerified(file, destination)) {
            downloadedBytes += file.size
            completedFiles++
          } else {
            failedDownloads++
            retryNeeded = true
            setLastError("${file.path} 完整性校验失败，正在重新下载")
          }
        }
        DownloadManager.STATUS_FAILED -> {
          downloadedBytes += snapshot.downloadedBytes.coerceIn(0L, file.size)
          failedDownloads++
          retryNeeded = true
        }
        DownloadManager.STATUS_PENDING, DownloadManager.STATUS_RUNNING, DownloadManager.STATUS_PAUSED -> {
          downloadedBytes += snapshot.downloadedBytes.coerceIn(0L, file.size)
          activeDownloads++
        }
        else -> {
          if (sizeMatches && isVerified(file, destination)) {
            downloadedBytes += file.size
            completedFiles++
          } else if (destination.exists() || id >= 0) {
            failedDownloads++
            retryNeeded = true
          }
        }
      }
    }
    if (retryNeeded && hasValidatedInternet()) scheduleAsr()
    val ready = files.isNotEmpty() && completedFiles == files.size
    val lastError = preferences.getString(KEY_LAST_ERROR, null)
    val state = when {
      ready -> "ready"
      failedDownloads > 0 || lastError != null -> "error"
      scheduling.get() -> "checking"
      activeDownloads > 0 -> "downloading"
      !hasValidatedInternet() -> "waiting_network"
      files.isEmpty() -> "checking"
      else -> "queued"
    }
    return JSObject().apply {
      put("model_id", ASR_MODEL_ID)
      put("repository_url", REPOSITORIES.getValue(ASR_MODEL_ID))
      put("state", state)
      put("ready", ready)
      put("automatic", true)
      put("downloaded_bytes", downloadedBytes)
      put("total_bytes", expectedBytes)
      put("completed_files", completedFiles)
      put("file_count", files.size)
      put("install_path", modelRoot().absolutePath)
      put("last_error", lastError)
    }
  }

  private fun modelRoot(): File = File(activity.getExternalFilesDir(null), MODEL_RELATIVE_ROOT).apply { mkdirs() }

  private fun downloadUrl(path: String): String {
    val encoded = path.split('/').joinToString("/") { Uri.encode(it) }
    return "https://modelscope.cn/models/$ASR_MODEL_ID/resolve/master/$encoded"
  }

  private fun downloadKey(path: String) = "download.${path.replace('/', '_')}"
  private fun verifiedKey(path: String) = "verified.${path.replace('/', '_')}"

  private fun isVerified(file: RepoFile, destination: File): Boolean {
    if (!destination.isFile || destination.length() != file.size) return false
    if (file.sha256.isBlank()) return true
    if (preferences.getString(verifiedKey(file.path), null) == file.sha256) return true
    val digest = MessageDigest.getInstance("SHA-256")
    destination.inputStream().buffered(1024 * 1024).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    val actual = digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    val valid = actual.equals(file.sha256, ignoreCase = true)
    if (valid) {
      preferences.edit().putString(verifiedKey(file.path), file.sha256).apply()
    } else {
      Log.e(TAG, "checksum mismatch for ${file.path}: expected ${file.sha256}, got $actual")
    }
    return valid
  }

  private fun saveCatalog(files: List<RepoFile>) {
    val array = JSONArray()
    files.forEach { file ->
      array.put(JSONObject().put("path", file.path).put("size", file.size).put("sha256", file.sha256))
    }
    preferences.edit().putString(KEY_CATALOG, array.toString()).apply()
  }

  private fun loadCatalog(): List<RepoFile> {
    val raw = preferences.getString(KEY_CATALOG, null) ?: return emptyList()
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

  private fun setLastError(value: String?) {
    preferences.edit().apply {
      if (value == null) remove(KEY_LAST_ERROR) else putString(KEY_LAST_ERROR, value)
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
    private const val PREFERENCES = "realtopia.model.downloads"
    private const val KEY_CATALOG = "asr.catalog"
    private const val KEY_LAST_ERROR = "asr.last_error"
    private const val ASR_MODEL_ID = "huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN"
    private const val ASR_FILES_URL =
      "https://modelscope.cn/api/v1/models/$ASR_MODEL_ID/repo/files?Recursive=true"
    private const val MODEL_RELATIVE_ROOT = "models/$ASR_MODEL_ID"
    private const val USER_AGENT = "RealTopia-Android/0.1 ModelScopeDownloader"
    private val REPOSITORIES = mapOf(
      ASR_MODEL_ID to "https://modelscope.cn/models/$ASR_MODEL_ID/",
      "MNN/Qwen3-1.7B-MNN" to "https://modelscope.cn/models/MNN/Qwen3-1.7B-MNN",
      "MNN/Qwen3-VL-2B-Instruct-MNN" to "https://modelscope.cn/models/MNN/Qwen3-VL-2B-Instruct-MNN",
      "MNN/Qwen3-VL-4B-Instruct-MNN" to "https://modelscope.cn/models/MNN/Qwen3-VL-4B-Instruct-MNN",
      "huangzhengxiang/Qwen3-TTS-0.6B-Base-FP16-MNN" to
        "https://modelscope.cn/models/huangzhengxiang/Qwen3-TTS-0.6B-Base-FP16-MNN",
    )
  }
}
