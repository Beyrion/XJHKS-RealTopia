package com.realtopia.phone.face

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@InvokeArg
class AnalyzeFaceArgs {
  lateinit var path: String
  var rotationDegrees: Int = 0
  var minimumFaceAt640: Float = 24.0f
}

@TauriPlugin
class RealiaFacePlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = FaceNative()
  private var engineHandle: Long = 0
  private var modelLoadMs: Long = -1
  private var lastError: String? = null

  @Command
  fun analyze(invoke: Invoke) {
    val args = invoke.parseArgs(AnalyzeFaceArgs::class.java)
    worker.execute {
      var bitmap: Bitmap? = null
      try {
        val startedAt = SystemClock.elapsedRealtime()
        ensureEngine()
        val decodeStartedAt = SystemClock.elapsedRealtime()
        val decoded = decodeForInference(File(args.path))
        bitmap = decoded
        val decodeMs = SystemClock.elapsedRealtime() - decodeStartedAt
        val nativeJson = native.analyze(
          engineHandle,
          decoded,
          normalizeRotation(args.rotationDegrees),
          args.minimumFaceAt640.coerceIn(8.0f, 160.0f),
        )
        val result = JSObject(nativeJson)
        if (result.has("error")) throw IllegalStateException(result.getString("error"))
        result.put("decode_ms", decodeMs)
        result.put("model_load_ms", modelLoadMs)
        result.put("processing_total_ms", SystemClock.elapsedRealtime() - startedAt)
        lastError = null
        invoke.resolve(result)
      } catch (error: Exception) {
        lastError = error.message ?: error.javaClass.simpleName
        Log.e(TAG, "face analysis failed", error)
        invoke.reject("face analysis failed: $lastError")
      } finally {
        bitmap?.recycle()
      }
    }
  }

  @Command
  fun status(invoke: Invoke) {
    val response = JSObject()
    response.put("loaded", engineHandle != 0L)
    response.put("model_load_ms", modelLoadMs)
    response.put("last_error", lastError)
    invoke.resolve(response)
  }

  private fun ensureEngine() {
    if (engineHandle != 0L) return
    val modelDir = File(activity.noBackupFilesDir, "face-models").apply { mkdirs() }
    val packagedManifest = activity.assets.open("face/manifest.json").bufferedReader().use { it.readText() }
    val installedManifest = File(modelDir, "manifest.json")
    val replaceModels = !installedManifest.isFile || installedManifest.readText() != packagedManifest
    val detector = ensureAsset(
      "face/det_2.5g.mnn", File(modelDir, "det_2.5g.mnn"), replaceModels,
    )
    val recognizer = ensureAsset(
      "face/w600k_r50.mnn", File(modelDir, "w600k_r50.mnn"), replaceModels,
    )
    if (replaceModels) installManifest(installedManifest, packagedManifest)
    val startedAt = SystemClock.elapsedRealtime()
    engineHandle = native.create(detector.absolutePath, recognizer.absolutePath, THREADS)
    modelLoadMs = SystemClock.elapsedRealtime() - startedAt
    Log.i(TAG, "detector engine loaded in ${modelLoadMs}ms; recognizer is lazy")
  }

  private fun ensureAsset(assetPath: String, destination: File, force: Boolean): File {
    val packagedLength = activity.assets.openFd(assetPath).use { it.length }
    if (!force && destination.isFile && destination.length() == packagedLength) return destination
    val temporary = File(destination.parentFile, "${destination.name}.tmp")
    activity.assets.open(assetPath).use { input ->
      FileOutputStream(temporary).use { output -> input.copyTo(output, 1024 * 1024) }
    }
    Files.move(
      temporary.toPath(), destination.toPath(),
      StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
    )
    return destination
  }

  private fun installManifest(destination: File, contents: String) {
    val temporary = File(destination.parentFile, "${destination.name}.tmp")
    temporary.writeText(contents)
    Files.move(
      temporary.toPath(), destination.toPath(),
      StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
    )
  }

  private fun decodeForInference(file: File): Bitmap {
    require(file.isFile) { "capture does not exist: ${file.absolutePath}" }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "invalid JPEG: ${file.absolutePath}" }
    val sampleSize = if (maxOf(bounds.outWidth, bounds.outHeight) > 2500) 2 else 1
    val options = BitmapFactory.Options().apply {
      inPreferredConfig = Bitmap.Config.ARGB_8888
      inSampleSize = sampleSize
    }
    val decoded = BitmapFactory.decodeFile(file.absolutePath, options)
      ?: throw IllegalStateException("JPEG decode failed: ${file.absolutePath}")
    return if (decoded.config == Bitmap.Config.ARGB_8888) {
      decoded
    } else {
      decoded.copy(Bitmap.Config.ARGB_8888, false).also { decoded.recycle() }
    }
  }

  private fun normalizeRotation(value: Int): Int {
    val normalized = ((value % 360) + 360) % 360
    return when (normalized) {
      in 45 until 135 -> 90
      in 135 until 225 -> 180
      in 225 until 315 -> 270
      else -> 0
    }
  }

  override fun onDestroy(activity: AppCompatActivity) {
    worker.execute {
      if (engineHandle != 0L) {
        native.destroy(engineHandle)
        engineHandle = 0
      }
    }
    worker.shutdown()
  }

  companion object {
    private const val TAG = "RealTopiaFace"
    private const val THREADS = 6
  }
}
