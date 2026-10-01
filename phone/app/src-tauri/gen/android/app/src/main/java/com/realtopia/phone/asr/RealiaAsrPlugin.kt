package com.realtopia.phone.asr

import android.app.Activity
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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@InvokeArg
class TranscribeArgs {
  lateinit var pcmPath: String
  var sampleRate: Int = 16000
  var channels: Int = 1
  var maxNewTokens: Int = 256
}

@TauriPlugin
class RealiaAsrPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = AsrNative()
  private var engineHandle: Long = 0
  private var modelLoadMs: Long = -1
  private var lastError: String? = null

  @Command
  fun transcribe(invoke: Invoke) {
    val args = invoke.parseArgs(TranscribeArgs::class.java)
    worker.execute {
      try {
        ensureEngine()
        val recording = File(args.pcmPath).canonicalFile
        val filesRoot = activity.getExternalFilesDir(null)?.canonicalFile
          ?: throw IllegalStateException("external app storage is unavailable")
        require(recording.isFile && recording.toPath().startsWith(filesRoot.toPath())) {
          "recording is outside app storage or does not exist"
        }
        val nativeJson = native.transcribe(
          engineHandle,
          recording.absolutePath,
          args.sampleRate,
          args.channels,
          args.maxNewTokens.coerceIn(8, 512),
        )
        val result = JSObject(nativeJson)
        if (result.has("error")) throw IllegalStateException(result.getString("error"))
        result.put("model_load_ms", modelLoadMs)
        lastError = null
        invoke.resolve(result)
      } catch (error: Exception) {
        lastError = error.message ?: error.javaClass.simpleName
        Log.e(TAG, "local transcription failed", error)
        invoke.reject("local ASR failed: $lastError")
      }
    }
  }

  @Command
  fun status(invoke: Invoke) {
    val config = File(modelRoot(), "config.json")
    invoke.resolve(JSObject().apply {
      put("ready", config.isFile)
      put("loaded", engineHandle != 0L)
      put("model_load_ms", modelLoadMs)
      put("last_error", lastError)
    })
  }

  private fun ensureEngine() {
    if (engineHandle != 0L) return
    val root = modelRoot()
    for (name in REQUIRED_FILES) require(File(root, name).isFile) {
      "ASR model is not installed completely: $name"
    }
    val startedAt = SystemClock.elapsedRealtime()
    engineHandle = native.create(File(root, "config.json").absolutePath)
    modelLoadMs = SystemClock.elapsedRealtime() - startedAt
    check(engineHandle != 0L) { "MNN could not load the ASR model" }
    Log.i(TAG, "Qwen3-ASR loaded in ${modelLoadMs}ms")
  }

  private fun modelRoot(): File = File(
    activity.getExternalFilesDir(null),
    "models/huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN",
  )

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
    private const val TAG = "RealTopiaAsr"
    private val REQUIRED_FILES = arrayOf(
      "config.json", "llm_config.json", "tokenizer.txt", "embeddings_bf16.bin",
      "audio.mnn", "audio.mnn.weight", "llm.mnn", "llm.mnn.weight",
    )
  }
}
