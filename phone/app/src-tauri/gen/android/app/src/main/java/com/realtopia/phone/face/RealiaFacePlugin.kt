package com.realtopia.phone.face

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.ActivityCallback
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
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil
import org.json.JSONArray

@InvokeArg
class AnalyzeFaceArgs {
  lateinit var path: String
  var rotationDegrees: Int = 0
  var minimumFaceAt640: Float = RUNTIME_MINIMUM_FACE_AT_640

  private companion object {
    const val RUNTIME_MINIMUM_FACE_AT_640 = 40.0f
  }
}

@InvokeArg
class SaveFaceCropArgs {
  lateinit var path: String
  lateinit var outputPath: String
  var rotationDegrees: Int = 0
  var x1: Float = 0.0f
  var y1: Float = 0.0f
  var x2: Float = 0.0f
  var y2: Float = 0.0f
}

@TauriPlugin
class RealiaFacePlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = FaceNative()
  private var engineHandle: Long = 0
  private var modelLoadMs: Long = -1
  private var lastError: String? = null
  private val pickerActive = AtomicBoolean(false)

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
  fun saveFaceCrop(invoke: Invoke) {
    val args = invoke.parseArgs(SaveFaceCropArgs::class.java)
    worker.execute {
      var decoded: Bitmap? = null
      var rotated: Bitmap? = null
      var cropped: Bitmap? = null
      var outputBitmap: Bitmap? = null
      try {
        decoded = decodeForInference(File(args.path))
        val rotation = normalizeRotation(args.rotationDegrees)
        rotated = if (rotation == 0) decoded else Bitmap.createBitmap(
          decoded, 0, 0, decoded.width, decoded.height,
          Matrix().apply { postRotate(rotation.toFloat()) }, true,
        )
        val width = rotated.width
        val height = rotated.height
        val faceWidth = args.x2 - args.x1
        val faceHeight = args.y2 - args.y1
        require(faceWidth > 1.0f && faceHeight > 1.0f) { "invalid face bounds" }
        val side = maxOf(faceWidth, faceHeight) * FACE_CROP_MARGIN
        val centerX = (args.x1 + args.x2) * 0.5f
        val centerY = (args.y1 + args.y2) * 0.5f
        val left = (centerX - side * 0.5f).toInt().coerceIn(0, width - 1)
        val top = (centerY - side * 0.5f).toInt().coerceIn(0, height - 1)
        val cropWidth = side.toInt().coerceAtLeast(1).coerceAtMost(width - left)
        val cropHeight = side.toInt().coerceAtLeast(1).coerceAtMost(height - top)
        cropped = Bitmap.createBitmap(rotated, left, top, cropWidth, cropHeight)
        outputBitmap = if (maxOf(cropWidth, cropHeight) > FACE_CROP_SIDE) {
          val scale = FACE_CROP_SIDE.toFloat() / maxOf(cropWidth, cropHeight)
          Bitmap.createScaledBitmap(
            cropped,
            (cropWidth * scale).toInt().coerceAtLeast(1),
            (cropHeight * scale).toInt().coerceAtLeast(1),
            true,
          )
        } else cropped
        val output = File(args.outputPath)
        output.parentFile?.mkdirs()
        val temporary = File(output.parentFile, "${output.name}.tmp")
        FileOutputStream(temporary).use { stream ->
          check(outputBitmap.compress(Bitmap.CompressFormat.JPEG, FACE_CROP_QUALITY, stream)) {
            "face crop JPEG encode failed"
          }
          stream.fd.sync()
        }
        Files.move(
          temporary.toPath(), output.toPath(),
          StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
        )
        invoke.resolve(JSObject().apply {
          put("path", output.absolutePath)
          put("width", outputBitmap.width)
          put("height", outputBitmap.height)
        })
      } catch (error: Exception) {
        Log.e(TAG, "save face crop failed", error)
        invoke.reject("保存陌生人人脸失败：${error.message ?: error.javaClass.simpleName}")
      } finally {
        if (outputBitmap !== cropped) outputBitmap?.recycle()
        cropped?.recycle()
        if (rotated !== decoded) rotated?.recycle()
        decoded?.recycle()
      }
    }
  }

  @Command
  fun pickEnrollmentPhotos(invoke: Invoke) {
    if (!pickerActive.compareAndSet(false, true)) {
      invoke.reject("已有一个人物录入任务正在选择照片")
      return
    }
    try {
      val contract = ActivityResultContracts.PickMultipleVisualMedia(ENROLLMENT_PHOTO_COUNT)
      val request = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
      startActivityForResult(
        invoke,
        contract.createIntent(activity, request),
        "onEnrollmentPhotosPicked",
      )
    } catch (error: Exception) {
      pickerActive.set(false)
      lastError = error.message ?: error.javaClass.simpleName
      invoke.reject("无法打开系统图库：$lastError")
    }
  }

  @ActivityCallback
  fun onEnrollmentPhotosPicked(invoke: Invoke, activityResult: ActivityResult) {
    pickerActive.set(false)
    val contract = ActivityResultContracts.PickMultipleVisualMedia(ENROLLMENT_PHOTO_COUNT)
    val uris = contract.parseResult(activityResult.resultCode, activityResult.data)
    if (uris.isEmpty()) {
      invoke.reject("已取消选择照片")
      return
    }
    if (uris.size != ENROLLMENT_PHOTO_COUNT) {
      invoke.reject("需要正好选择 $ENROLLMENT_PHOTO_COUNT 张照片，当前选择了 ${uris.size} 张")
      return
    }
    if (uris.distinct().size != ENROLLMENT_PHOTO_COUNT) {
      invoke.reject("请选择 $ENROLLMENT_PHOTO_COUNT 张不同的照片")
      return
    }
    worker.execute { analyzeEnrollmentPhotos(invoke, uris) }
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

  private fun decodeForInference(uri: Uri): Bitmap {
    val source = ImageDecoder.createSource(activity.contentResolver, uri)
    val decoded = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      val largestSide = maxOf(info.size.width, info.size.height)
      if (largestSide > MAX_IMAGE_SIDE) {
        decoder.setTargetSampleSize(ceil(largestSide.toDouble() / MAX_IMAGE_SIDE).toInt())
      }
    }
    return if (decoded.config == Bitmap.Config.ARGB_8888) {
      decoded
    } else {
      decoded.copy(Bitmap.Config.ARGB_8888, false).also { decoded.recycle() }
    }
  }

  private fun analyzeEnrollmentPhotos(invoke: Invoke, uris: List<Uri>) {
    val startedAt = SystemClock.elapsedRealtime()
    try {
      ensureEngine()
      val embeddings = JSONArray()
      val photos = JSONArray()
      uris.forEachIndexed { index, uri ->
        var bitmap: Bitmap? = null
        try {
          val photoStartedAt = SystemClock.elapsedRealtime()
          val decodeStartedAt = SystemClock.elapsedRealtime()
          bitmap = decodeForInference(uri)
          val decodeMs = SystemClock.elapsedRealtime() - decodeStartedAt
          val nativeResult = JSObject(
            native.analyze(
              engineHandle,
              bitmap,
              0,
              ENROLLMENT_MINIMUM_FACE_AT_640,
            ),
          )
          if (nativeResult.has("error")) {
            throw IllegalStateException(nativeResult.getString("error"))
          }
          val faces = nativeResult.optJSONArray("faces") ?: JSONArray()
          val eligible = (0 until faces.length()).mapNotNull { faceIndex ->
            faces.optJSONObject(faceIndex)?.takeIf { face ->
              face.optBoolean("eligible") && face.optJSONArray("embedding")?.length() == EMBEDDING_SIZE
            }
          }
          if (eligible.size != 1) {
            val imageLongSide = maxOf(
              nativeResult.optDouble("image_width"),
              nativeResult.optDouble("image_height"),
            )
            val largestFaceAt640 = (0 until faces.length()).mapNotNull { faceIndex ->
              val box = faces.optJSONObject(faceIndex)?.optJSONArray("bbox") ?: return@mapNotNull null
              if (box.length() != 4 || imageLongSide <= 0.0) return@mapNotNull null
              minOf(box.optDouble(2) - box.optDouble(0), box.optDouble(3) - box.optDouble(1)) *
                640.0 / imageLongSide
            }.maxOrNull()
            val sizeHint = largestFaceAt640?.let { ", 最大人脸约 %.1fpx@640".format(it) } ?: ""
            throw IllegalArgumentException(
              "第 ${index + 1} 张照片需要恰好一张清晰、尺寸足够的人脸，检测到 ${faces.length()} 张、" +
                "其中 ${eligible.size} 张可用$sizeHint",
            )
          }
          embeddings.put(eligible.single().getJSONArray("embedding"))
          photos.put(JSObject().apply {
            put("index", index + 1)
            put("detected_count", nativeResult.optInt("detected_count"))
            put("detection_score", eligible.single().optDouble("detection_score"))
            put("decode_ms", decodeMs)
            put("processing_ms", SystemClock.elapsedRealtime() - photoStartedAt)
          })
        } finally {
          bitmap?.recycle()
        }
      }
      val response = JSObject().apply {
        put("selected_count", uris.size)
        put("valid_count", embeddings.length())
        put("embeddings", embeddings)
        put("photos", photos)
        put("model_load_ms", modelLoadMs)
        put("processing_total_ms", SystemClock.elapsedRealtime() - startedAt)
      }
      Log.i(
        TAG,
        "enrollment analyzed ${embeddings.length()} photos in " +
          "${SystemClock.elapsedRealtime() - startedAt}ms",
      )
      lastError = null
      invoke.resolve(response)
    } catch (error: Exception) {
      lastError = error.message ?: error.javaClass.simpleName
      Log.e(TAG, "enrollment photo analysis failed", error)
      invoke.reject(lastError!!)
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
    private const val ENROLLMENT_PHOTO_COUNT = 9
    private const val EMBEDDING_SIZE = 512
    private const val MAX_IMAGE_SIDE = 2500
    private const val ENROLLMENT_MINIMUM_FACE_AT_640 = 20.0f
    private const val FACE_CROP_MARGIN = 1.55f
    private const val FACE_CROP_SIDE = 512
    private const val FACE_CROP_QUALITY = 88
  }
}
