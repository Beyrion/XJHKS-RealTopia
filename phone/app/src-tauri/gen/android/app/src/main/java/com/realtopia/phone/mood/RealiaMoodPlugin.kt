package com.realtopia.phone.mood

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.realtopia.phone.vad.SileroVadModel
import com.realtopia.phone.vad.TurnSenseModel
import com.realtopia.phone.vad.VadEndpointState
import com.realtopia.phone.vad.VadNative
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import kotlin.math.max

/** Records phone microphone PCM for the app-owned Qwen3-ASR pipeline. */
@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "recordAudio"),
  ],
)
class RealiaMoodPlugin(private val activity: Activity) : Plugin(activity) {
  private val handler = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  @Volatile private var recording = false
  @Volatile private var cancelled = false
  private var recorder: AudioRecord? = null
  private var pending: Invoke? = null
  private var outputFile: File? = null
  private var startedAtMs = 0L
  private var permissionAutomaticEndpoint = false
  private val vadNative = VadNative()
  private val acousticModel = SileroVadModel(activity, vadNative)
  private val semanticModel = TurnSenseModel(activity, vadNative)
  private val endpoint = VadEndpointState()
  private val recordingTimeout = Runnable { stopRecording(false) }

  @Command
  fun listen(invoke: Invoke) {
    requestRecording(invoke, false)
  }

  /** Records until Silero VAD and TurnSense agree that a spoken reply is complete. */
  @Command
  fun listenAutomatic(invoke: Invoke) {
    requestRecording(invoke, true)
  }

  private fun requestRecording(invoke: Invoke, useAutomaticEndpoint: Boolean) {
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      permissionAutomaticEndpoint = useAutomaticEndpoint
      requestPermissionForAlias(RECORD_AUDIO_ALIAS, invoke, "microphonePermissionResult")
      return
    }
    startRecording(invoke, useAutomaticEndpoint)
  }

  @PermissionCallback
  fun microphonePermissionResult(invoke: Invoke) {
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      startRecording(invoke, permissionAutomaticEndpoint)
    } else {
      invoke.reject("麦克风权限未授予，请在系统设置中允许 RealTopia 使用麦克风")
    }
  }

  private fun startRecording(invoke: Invoke, useAutomaticEndpoint: Boolean) {
    activity.runOnUiThread {
      if (pending != null || recording) {
        invoke.reject("已有一段心情语音正在录入")
        return@runOnUiThread
      }
      val minimum = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minimum <= 0) {
        invoke.reject("手机无法初始化麦克风录音")
        return@runOnUiThread
      }
      val audioRecord = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(minimum * 2, SAMPLE_RATE * 2),
      )
      if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
        audioRecord.release()
        invoke.reject("手机麦克风录音器初始化失败")
        return@runOnUiThread
      }
      val directory = File(activity.getExternalFilesDir(null), "mood-recordings").apply { mkdirs() }
      val file = File(directory, "mood-${System.currentTimeMillis()}.pcm")
      pending = invoke
      recorder = audioRecord
      outputFile = file
      cancelled = false
      recording = true
      endpoint.reset()
      acousticModel.reset()
      startedAtMs = SystemClock.elapsedRealtime()
      handler.postDelayed(
        recordingTimeout,
        if (useAutomaticEndpoint) AUTOMATIC_RESPONSE_TIMEOUT_MS else MAX_RECORDING_MS,
      )
      worker.execute {
        if (useAutomaticEndpoint) recordAutomaticLoop(audioRecord, file)
        else recordLoop(audioRecord, file)
      }
    }
  }

  private fun recordAutomaticLoop(audioRecord: AudioRecord, file: File) {
    val captured = ByteArrayOutputStream()
    val chunkFile = File(activity.cacheDir, "automatic-response-vad.pcm")
    try {
      val buffer = ByteArray(8_192)
      audioRecord.startRecording()
      while (recording) {
        val read = audioRecord.read(buffer, 0, buffer.size)
        if (read > 0) {
          captured.write(buffer, 0, read)
          chunkFile.outputStream().use { it.write(buffer, 0, read) }
          val acoustic = acousticModel.analyze(chunkFile)
          val decision = endpoint.accept(acoustic.probabilities)
          if (!decision.endpoint) continue
          if (decision.reason != "neural_silence") {
            recording = false
            break
          }
          when (semanticModel.classify(captured.toByteArray()).label) {
            "complete" -> {
              recording = false
              break
            }
            "incomplete" -> endpoint.deferSemanticEndpoint()
            else -> {
              // A cough/noise candidate is discarded and listening continues.
              captured.reset()
              endpoint.reset()
              acousticModel.reset()
            }
          }
        } else if (read < 0 && recording) {
          throw IllegalStateException("麦克风读取失败（$read）")
        }
      }
      try { audioRecord.stop() } catch (_: IllegalStateException) { }
      file.outputStream().use { captured.writeTo(it) }
      finishRecording(file)
    } catch (error: Exception) {
      val current = clearState()
      file.delete()
      current?.reject(error.message ?: "自动回应感知失败")
    } finally {
      chunkFile.delete()
    }
  }

  private fun recordLoop(audioRecord: AudioRecord, file: File) {
    try {
      val buffer = ByteArray(8_192)
      audioRecord.startRecording()
      FileOutputStream(file).use { output ->
        while (recording) {
          val read = audioRecord.read(buffer, 0, buffer.size)
          if (read > 0) output.write(buffer, 0, read)
          else if (read < 0 && recording) throw IllegalStateException("麦克风读取失败（$read）")
        }
      }
      finishRecording(file)
    } catch (error: Exception) {
      val current = clearState()
      file.delete()
      current?.reject(error.message ?: "手机麦克风录音失败")
    }
  }

  @Command
  fun finish(invoke: Invoke) {
    activity.runOnUiThread {
      if (pending == null || !recording) {
        invoke.reject("当前没有正在进行的语音输入")
        return@runOnUiThread
      }
      stopRecording(false)
      invoke.resolve()
    }
  }

  @Command
  fun cancel(invoke: Invoke) {
    activity.runOnUiThread {
      if (pending != null) stopRecording(true)
      invoke.resolve()
    }
  }

  private fun stopRecording(asCancellation: Boolean) {
    handler.removeCallbacks(recordingTimeout)
    cancelled = asCancellation
    recording = false
    try { recorder?.stop() } catch (_: IllegalStateException) { /* worker may still be starting */ }
  }

  private fun finishRecording(file: File) {
    val wasCancelled = cancelled
    val durationMs = SystemClock.elapsedRealtime() - startedAtMs
    val current = clearState()
    if (wasCancelled) {
      file.delete()
      current?.reject("心情语音已取消")
      return
    }
    if (!file.isFile || file.length() < MIN_PCM_BYTES) {
      file.delete()
      current?.reject("录音太短，请说完后再点击“说完了”")
      return
    }
    current?.resolve(JSObject().apply {
      put("path", file.absolutePath)
      put("sampleRate", SAMPLE_RATE)
      put("channels", 1)
      put("bytes", file.length())
      put("durationMs", durationMs)
    })
  }

  private fun clearState(): Invoke? {
    handler.removeCallbacks(recordingTimeout)
    recording = false
    try { recorder?.release() } catch (_: Exception) { }
    recorder = null
    outputFile = null
    endpoint.reset()
    acousticModel.reset()
    val current = pending
    pending = null
    return current
  }

  override fun onDestroy(activity: AppCompatActivity) {
    if (pending != null) stopRecording(true)
    worker.execute {
      acousticModel.close()
      semanticModel.close()
    }
    worker.shutdown()
  }

  companion object {
    private const val RECORD_AUDIO_ALIAS = "recordAudio"
    private const val SAMPLE_RATE = 16_000
    private const val MAX_RECORDING_MS = 45_000L
    private const val AUTOMATIC_RESPONSE_TIMEOUT_MS = 45_000L
    private const val MIN_PCM_BYTES = 3_200L
  }
}
