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

@InvokeArg class SpeakerArgs {
  lateinit var pcmPath: String
  var sampleRate: Int = 16000
  var channels: Int = 1
  var sessionId: Long = 0
}

@TauriPlugin
class RealiaAsrPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = AsrNative()
  private val speakers = ConsecutiveDiarizer(activity)
  private var engineHandle: Long = 0
  private var modelLoadMs: Long = -1
  private var lastError: String? = null

  @Command fun warmupSpeakers(invoke: Invoke) {
    worker.execute { try { invoke.resolve(speakers.warmup()) } catch (e: Exception) { invoke.reject("说话人模型加载失败：${e.message}") } }
  }
  @Command fun diarize(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakerArgs::class.java)
    worker.execute { try { invoke.resolve(speakers.process(args.pcmPath, args.sampleRate, args.channels, args.sessionId)) } catch (e: Exception) { speakers.cleanup(); invoke.reject("说话人分段失败：${e.message}") } }
  }
  @Command fun releaseSpeakerTurns(invoke: Invoke) {
    worker.execute { speakers.cleanup(); invoke.resolve() }
  }
  @Command fun resetSpeakerSession(invoke: Invoke) {
    worker.execute { speakers.resetSession(); invoke.resolve() }
  }

  @Command
  fun warmup(invoke: Invoke) {
    worker.execute {
      try {
        val reused = engineHandle != 0L
        ensureEngine()
        invoke.resolve(JSObject().apply {
          put("loaded", true); put("reused", reused)
          put("load_ms", if (reused) 0 else modelLoadMs)
        })
      } catch (error: Exception) {
        lastError = error.message ?: error.javaClass.simpleName
        invoke.reject("ASR预加载失败：$lastError")
      }
    }
  }

  @Command
  fun transcribe(invoke: Invoke) {
    val args = invoke.parseArgs(TranscribeArgs::class.java)
    worker.execute {
      try {
        val reused = engineHandle != 0L
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
        result.put("load_this_call_ms", if (reused) 0 else modelLoadMs)
        result.put("model_reused", reused)
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
      speakers.release()
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
