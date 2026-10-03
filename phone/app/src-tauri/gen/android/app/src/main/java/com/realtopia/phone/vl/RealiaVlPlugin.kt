package com.realtopia.phone.vl

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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil

@InvokeArg
class AnalyzeVisionArgs {
  lateinit var modelId: String
  lateinit var path: String
  var rotationDegrees: Int = 0
  var prompt: String = DEFAULT_PROMPT
  var maxNewTokens: Int = DEFAULT_MAX_NEW_TOKENS

  companion object {
    const val DEFAULT_PROMPT =
      "请只用一句中文描述图片中的主要人物、物体、动作和场景，不超过50个汉字，不要解释过程，不要猜测看不清的文字。"
    const val DEFAULT_MAX_NEW_TOKENS = 128
  }
}

@InvokeArg
class PickAndAnalyzeVisionArgs {
  lateinit var modelId: String
  var prompt: String = AnalyzeVisionArgs.DEFAULT_PROMPT
  var maxNewTokens: Int = AnalyzeVisionArgs.DEFAULT_MAX_NEW_TOKENS
}

/** Runs either Qwen3-VL variant through the shared MNN multimodal runtime. */
@TauriPlugin
class RealiaVlPlugin(private val activity: Activity) : Plugin(activity) {
  private data class PendingRequest(val modelId: String, val prompt: String, val maxNewTokens: Int)

  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = VlNative()
  private val pickerActive = AtomicBoolean(false)
  @Volatile private var pendingRequest: PendingRequest? = null
  private var engineHandle: Long = 0
  private var loadedModelId: String? = null
  private var modelLoadMs: Long = -1
  private var lastError: String? = null

  @Command
  fun warmup(invoke: Invoke) {
    val args = invoke.parseArgs(PickAndAnalyzeVisionArgs::class.java)
    worker.execute {
      try {
        val reused = engineHandle != 0L && loadedModelId == args.modelId
        ensureEngine(args.modelId)
        invoke.resolve(JSObject().apply {
          put("loaded", true); put("reused", reused)
          put("load_ms", if (reused) 0 else modelLoadMs)
        })
      } catch (error: Exception) { reject(invoke, error) }
    }
  }

  @Command
  fun analyze(invoke: Invoke) {
    val args = invoke.parseArgs(AnalyzeVisionArgs::class.java)
    worker.execute {
      var bitmap: Bitmap? = null
      try {
        val source = requireAppImage(File(args.path))
        bitmap = decodeForInference(source, args.rotationDegrees)
        resolveAnalysis(invoke, args.modelId, bitmap, args.prompt, args.maxNewTokens)
      } catch (error: Exception) {
        reject(invoke, error)
      } finally {
        bitmap?.recycle()
      }
    }
  }

  @Command
  fun pickAndAnalyze(invoke: Invoke) {
    val args = invoke.parseArgs(PickAndAnalyzeVisionArgs::class.java)
    if (!pickerActive.compareAndSet(false, true)) {
      invoke.reject("已有一个视觉理解任务正在选择图片")
      return
    }
    pendingRequest = PendingRequest(args.modelId, args.prompt, args.maxNewTokens)
    try {
      val contract = ActivityResultContracts.PickVisualMedia()
      val request = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
      startActivityForResult(invoke, contract.createIntent(activity, request), "onVisionImagePicked")
    } catch (error: Exception) {
      pickerActive.set(false)
      pendingRequest = null
      reject(invoke, error)
    }
  }

  @ActivityCallback
  fun onVisionImagePicked(invoke: Invoke, activityResult: ActivityResult) {
    pickerActive.set(false)
    val uri = ActivityResultContracts.PickVisualMedia().parseResult(
      activityResult.resultCode,
      activityResult.data,
    )
    if (uri == null) {
      pendingRequest = null
      invoke.reject("已取消选择图片")
      return
    }
    val request = pendingRequest
    pendingRequest = null
    if (request == null) {
      invoke.reject("视觉理解请求状态已丢失，请重试")
      return
    }
    worker.execute {
      var bitmap: Bitmap? = null
      try {
        bitmap = decodeForInference(uri)
        resolveAnalysis(
          invoke,
          request.modelId,
          bitmap,
          request.prompt,
          request.maxNewTokens,
        )
      } catch (error: Exception) {
        reject(invoke, error)
      } finally {
        bitmap?.recycle()
      }
    }
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(JSObject().apply {
      put("loaded", engineHandle != 0L)
      put("model_id", loadedModelId)
      put("model_load_ms", modelLoadMs)
      put("last_error", lastError)
    })
  }

  private fun resolveAnalysis(
    invoke: Invoke,
    modelId: String,
    bitmap: Bitmap,
    rawPrompt: String,
    requestedMaxNewTokens: Int,
  ) {
    val prompt = rawPrompt.trim()
    require(prompt.isNotEmpty()) { "视觉问题不能为空" }
    require(prompt.length <= MAX_PROMPT_LENGTH) { "视觉问题不能超过 $MAX_PROMPT_LENGTH 个字符" }
    val startedAt = SystemClock.elapsedRealtime()
    ensureEngine(modelId)
    val nativeJson = native.analyze(
      engineHandle,
      bitmap,
      prompt,
      requestedMaxNewTokens.coerceIn(MIN_NEW_TOKENS, MAX_NEW_TOKENS),
    )
    val result = JSObject(nativeJson)
    if (result.has("error")) throw IllegalStateException(result.getString("error"))
    result.put("model_load_ms", modelLoadMs)
    result.put("processing_total_ms", SystemClock.elapsedRealtime() - startedAt)
    lastError = null
    invoke.resolve(result)
  }

  private fun ensureEngine(modelId: String) {
    require(modelId in SUPPORTED_MODEL_IDS) { "不支持的视觉模型：$modelId" }
    if (engineHandle != 0L && loadedModelId == modelId) return
    if (engineHandle != 0L) {
      native.destroy(engineHandle)
      engineHandle = 0
      loadedModelId = null
    }
    val root = modelRoot(modelId)
    REQUIRED_FILES.forEach { name ->
      require(File(root, name).isFile) { "$modelId 尚未完整安装：缺少 $name" }
    }
    val startedAt = SystemClock.elapsedRealtime()
    engineHandle = native.create(File(root, "config.json").absolutePath)
    modelLoadMs = SystemClock.elapsedRealtime() - startedAt
    check(engineHandle != 0L) { "MNN 无法加载 $modelId" }
    loadedModelId = modelId
    Log.i(TAG, "$modelId loaded in ${modelLoadMs}ms")
  }

  private fun modelRoot(modelId: String) =
    File(activity.getExternalFilesDir(null), "models/$modelId")

  private fun requireAppImage(file: File): File {
    val canonical = file.canonicalFile
    val filesRoot = activity.getExternalFilesDir(null)?.canonicalFile
      ?: throw IllegalStateException("应用外部存储不可用")
    require(canonical.isFile && canonical.toPath().startsWith(filesRoot.toPath())) {
      "图片不在应用存储中或不存在"
    }
    return canonical
  }

  private fun decodeForInference(file: File, rotationDegrees: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "无效的图片" }
    val targetSample = ceil(maxOf(bounds.outWidth, bounds.outHeight).toDouble() / MAX_IMAGE_SIDE).toInt()
    var sampleSize = 1
    while (sampleSize * 2 <= targetSample) sampleSize *= 2
    val decoded = BitmapFactory.decodeFile(
      file.absolutePath,
      BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inSampleSize = sampleSize
      },
    ) ?: throw IllegalStateException("图片解码失败")
    return normalizeBitmap(decoded, rotationDegrees)
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
    return normalizeBitmap(decoded, 0)
  }

  private fun normalizeBitmap(source: Bitmap, rotationDegrees: Int): Bitmap {
    val rotation = ((rotationDegrees % 360) + 360) % 360
    var current = if (source.config == Bitmap.Config.ARGB_8888) {
      source
    } else {
      source.copy(Bitmap.Config.ARGB_8888, false).also { source.recycle() }
    }
    if (rotation != 0) {
      val rotated = Bitmap.createBitmap(
        current,
        0,
        0,
        current.width,
        current.height,
        Matrix().apply { postRotate(rotation.toFloat()) },
        true,
      )
      current.recycle()
      current = rotated
    }
    val largestSide = maxOf(current.width, current.height)
    if (largestSide <= MAX_IMAGE_SIDE) return current
    val scale = MAX_IMAGE_SIDE.toFloat() / largestSide
    val scaled = Bitmap.createScaledBitmap(
      current,
      (current.width * scale).toInt().coerceAtLeast(32),
      (current.height * scale).toInt().coerceAtLeast(32),
      true,
    )
    current.recycle()
    return scaled
  }

  private fun reject(invoke: Invoke, error: Exception) {
    lastError = error.message ?: error.javaClass.simpleName
    Log.e(TAG, "local vision inference failed", error)
    invoke.reject("本地视觉理解失败：$lastError")
  }

  override fun onDestroy(activity: AppCompatActivity) {
    worker.execute {
      if (engineHandle != 0L) {
        native.destroy(engineHandle)
        engineHandle = 0
        loadedModelId = null
      }
    }
    worker.shutdown()
  }

  companion object {
    private const val TAG = "RealTopiaVl"
    private const val MAX_IMAGE_SIDE = 896
    private const val MAX_PROMPT_LENGTH = 2_000
    private const val MIN_NEW_TOKENS = 8
    private const val MAX_NEW_TOKENS = 512
    private val SUPPORTED_MODEL_IDS = setOf(
      "MNN/Qwen3-VL-2B-Instruct-MNN",
      "MNN/Qwen3-VL-4B-Instruct-MNN",
    )
    private val REQUIRED_FILES = arrayOf(
      "config.json", "llm_config.json", "tokenizer.txt", "llm.mnn", "llm.mnn.weight",
      "visual.mnn", "visual.mnn.weight",
    )
  }
}
