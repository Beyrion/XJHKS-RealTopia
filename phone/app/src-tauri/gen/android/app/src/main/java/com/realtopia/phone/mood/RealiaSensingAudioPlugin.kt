package com.realtopia.phone.mood

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
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
import java.util.concurrent.Executors

@InvokeArg class SensingArgs { var sessionId: Long = 0; var take: Boolean = false; var recordingId: Long = 0; var drain: Boolean = false }

/** A single continuous microphone stream; VAD endpoints do not stop AudioRecord. */
@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "recordAudio")])
class RealiaSensingAudioPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker = Executors.newSingleThreadExecutor()
  private val native = VadNative()
  private val acoustic = SileroVadModel(activity, native)
  private val semantic = TurnSenseModel(activity, native)
  private val endpoint = VadEndpointState()
  private val lock = Any()
  @Volatile private var requestedSession = 0L
  @Volatile private var active = false
  @Volatile private var drainingSession = 0L
  private var recorder: AudioRecord? = null
  private var lastError: String? = null
  private var completed = 0
  private var vadRecoveries = 0
  private var sequence = 0
  private var audioLevel = 0.0
  private var vadProbability = 0.0
  private var vadLatencyMs = 0.0
  private var speechDetected = false
  private var listeningPhase = "idle"
  private var lastSampleAtMs = 0L
  private var lastTurnLabel: String? = null
  private val queue = SensingSegmentQueue<JSObject>(8) { File(it.getString("path")).delete() }

  @Command fun warmup(invoke: Invoke) {
    // Never enqueue behind the worker's continuous capture loop.
    synchronized(lock) {
      if (active) {
        val loaded = acoustic.loaded && semantic.loaded
        invoke.resolve(JSObject().apply { put("loaded", loaded); put("reused", loaded); put("load_ms", 0) })
        return
      }
    }
    worker.execute {
      try {
        val reused = acoustic.loaded && semantic.loaded
        val started = SystemClock.elapsedRealtime()
        acoustic.warmup(); semantic.warmup()
        invoke.resolve(JSObject().apply {
          put("loaded", true); put("reused", reused)
          put("load_ms", if (reused) 0 else SystemClock.elapsedRealtime() - started)
        })
        Log.i(TAG, "SENSING_MODELS_READY reused=$reused")
      } catch (error: Exception) {
        invoke.reject("VAD/TurnSense预加载失败：${error.message}")
      }
    }
  }

  @Command fun start(invoke: Invoke) {
    val args = invoke.parseArgs(SensingArgs::class.java)
    if (args.sessionId <= 0) { invoke.reject("invalid sensing session"); return }
    synchronized(lock) {
      if (active && requestedSession != args.sessionId) {
        invoke.reject("已有感知正在运行，请先关闭"); return
      }
      requestedSession = args.sessionId
    }
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissionForAlias("recordAudio", invoke, "microphonePermissionResult")
    } else startGranted(invoke, args.sessionId)
  }

  @PermissionCallback fun microphonePermissionResult(invoke: Invoke) {
    val args = invoke.parseArgs(SensingArgs::class.java)
    if (requestedSession != args.sessionId) { invoke.reject("感知已关闭，取消麦克风启动"); return }
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      synchronized(lock) { lastError = "麦克风权限未授予" }
      invoke.reject("麦克风权限未授予，请在系统设置中允许 RealTopia 使用麦克风")
    } else startGranted(invoke, args.sessionId)
  }

  private fun startGranted(invoke: Invoke, session: Long) {
    activity.runOnUiThread {
      if (requestedSession != session) { invoke.reject("感知已关闭"); return@runOnUiThread }
      synchronized(lock) {
        if (active) { invoke.resolve(snapshot(false)); return@runOnUiThread }
        if (recorder != null) { invoke.reject("上一段感知正在停止，请重试"); return@runOnUiThread }
        if (!MicrophoneLease.acquire(this)) { invoke.reject("麦克风正被其他语音输入使用"); return@runOnUiThread }
        try {
          val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
          check(minimum > 0) { "手机无法初始化麦克风" }
          val source = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 2, 128000))
          recorder = source
          check(source.state == AudioRecord.STATE_INITIALIZED) { "麦克风初始化失败" }
          source.startRecording()
          active = true; drainingSession = 0; lastError = null; completed = 0; vadRecoveries = 0
          audioLevel = 0.0; vadProbability = 0.0; speechDetected = false
          listeningPhase = "listening"; lastSampleAtMs = 0; lastTurnLabel = null
          queue.clearPending()
          Log.i(TAG, "SENSING_START session=$session microphone=phone sampleRate=16000")
          worker.execute { recordContinuously(source, session) }
          invoke.resolve(snapshot(false))
        } catch (error: Exception) {
          try { recorder?.release() } catch (_: Exception) { }
          recorder = null; active = false; MicrophoneLease.release(this)
          lastError = error.message
          invoke.reject("语音感知启动失败：${error.message}")
        }
      }
    }
  }

  private fun recordContinuously(source: AudioRecord, session: Long) {
    val candidate = ByteArrayOutputStream()
    val chunk = File(activity.cacheDir, "sensing-vad-$session.pcm")
    try {
      acoustic.warmup(); semantic.warmup()
      endpoint.reset(); acoustic.reset()
      val buffer = ByteArray(4096)
      while (active && requestedSession == session) {
        val count = source.read(buffer, 0, buffer.size)
        if (count < 0 && active) error("麦克风读取失败（$count）")
        if (count <= 0) continue
        synchronized(lock) {
          if (active && requestedSession == session) {
            audioLevel = AudioDebugLevels.rmsPcm16(buffer, count)
            lastSampleAtMs = System.currentTimeMillis()
          }
        }
        candidate.write(buffer, 0, count)
        chunk.outputStream().use { it.write(buffer, 0, count) }
        val vad = acoustic.analyze(chunk)
        if (vad.recoveredInvalidState) {
          candidate.reset(); endpoint.reset()
          synchronized(lock) {
            vadRecoveries++; vadProbability = 0.0; speechDetected = false
            listeningPhase = "recovery"
          }
          Log.w(TAG, "SENSING_VAD_RECOVER session=$session microphoneUnchanged=true")
          continue
        }
        val decision = endpoint.accept(vad.probabilities)
        synchronized(lock) {
          if (active && requestedSession == session) {
            vadProbability = vad.maxProbability; vadLatencyMs = vad.latencyMs
            speechDetected = endpoint.speechDetected
            listeningPhase = if (decision.endpoint) "turn_check" else if (!speechDetected) "listening"
              else if (vad.maxProbability >= 0.35) "speech"
              else if (listeningPhase == "waiting_continuation") "waiting_continuation" else "waiting_endpoint"
          }
        }
        if (!endpoint.speechDetected && candidate.size() > 32000) {
          val bytes = candidate.toByteArray(); candidate.reset()
          candidate.write(bytes, bytes.size - 32000, 32000)
        }
        if (!decision.endpoint) continue
        val turn = if (decision.reason == "neural_silence") semantic.classify(candidate.toByteArray()) else null
        synchronized(lock) { if (active && requestedSession == session) lastTurnLabel = turn?.label }
        if (turn?.label == "incomplete") {
          endpoint.deferSemanticEndpoint()
          synchronized(lock) { if (active && requestedSession == session) listeningPhase = "waiting_continuation" }
          continue
        }
        if (turn?.label != "invalid" && active && requestedSession == session) {
          val pcm = candidate.toByteArray()
          if (pcm.size >= 3200) {
            val id = session * 1000 + ++sequence
            val directory = File(activity.getExternalFilesDir(null), "recordings/sensing").apply { mkdirs() }
            val file = File(directory, "sensing-$id.pcm")
            file.writeBytes(pcm)
            val segment = JSObject().apply {
              put("recording_id", id); put("conversation_id", id); put("sequence", sequence)
              put("bytes", pcm.size); put("sample_rate", 16000); put("channels", 1)
              put("encoding", "pcm_s16le"); put("duration_ms", pcm.size / 32)
              put("transfer_ms", 0); put("path", file.absolutePath)
              put("sensing", true); put("sensing_session_id", session)
              put("partial", false); put("chunk", false); put("final_chunk", true)
              put("vad_latency_ms", vad.latencyMs); put("vad_reason", if (turn != null) "semantic_complete" else decision.reason)
              put("turn_label", turn?.label); put("turn_latency_ms", turn?.latencyMs)
            }
            synchronized(lock) {
              if (active && requestedSession == session) { queue.offer(segment); completed++ }
              else file.delete()
            }
            Log.i(TAG, "SENSING_SEGMENT session=$session sequence=$sequence durationMs=${pcm.size / 32} reason=${decision.reason}")
          }
        }
        candidate.reset(); endpoint.reset(); acoustic.reset()
        synchronized(lock) {
          if (active && requestedSession == session) { speechDetected = false; listeningPhase = "listening" }
        }
      }
    } catch (error: Exception) {
      synchronized(lock) { if (requestedSession == session && active) lastError = error.message }
      Log.e(TAG, "sensing loop failed", error)
    } finally {
      // Stop the microphone first, but preserve a spoken tail and queued endpoints
      // until the phone has transcribed the closing session. Never capture anew.
      if (drainingSession == session && endpoint.speechDetected && candidate.size() >= 3200) {
        val pcm = candidate.toByteArray()
        val id = session * 1000 + ++sequence
        val directory = File(activity.getExternalFilesDir(null), "recordings/sensing").apply { mkdirs() }
        val file = File(directory, "sensing-$id.pcm"); file.writeBytes(pcm)
        val segment = JSObject().apply {
          put("recording_id", id); put("conversation_id", id); put("sequence", sequence)
          put("bytes", pcm.size); put("sample_rate", 16000); put("channels", 1)
          put("encoding", "pcm_s16le"); put("duration_ms", pcm.size / 32)
          put("transfer_ms", 0); put("path", file.absolutePath)
          put("sensing", true); put("sensing_session_id", session)
          put("partial", false); put("chunk", false); put("final_chunk", true)
          put("vad_reason", "sensing_stop")
        }
        synchronized(lock) {
          if (drainingSession == session) { queue.offer(segment); completed++ } else file.delete()
        }
      }
      chunk.delete()
      try { source.stop() } catch (_: Exception) { }
      try { source.release() } catch (_: Exception) { }
      synchronized(lock) {
        if (recorder === source) {
          recorder = null; active = false; audioLevel = 0.0; speechDetected = false
          listeningPhase = if (lastError != null) "error" else "idle"
        }
        MicrophoneLease.release(this)
      }
      Log.i(TAG, "SENSING_STOP session=$session")
    }
  }

  @Command fun stop(invoke: Invoke) {
    val args = invoke.parseArgs(SensingArgs::class.java)
    synchronized(lock) {
      if (args.sessionId == 0L || requestedSession == args.sessionId) {
        drainingSession = if (args.drain) requestedSession else 0
        if (!args.drain) { requestedSession = 0; queue.clearPending() }
        active = false
        audioLevel = 0.0; speechDetected = false; listeningPhase = "idle"
        try { recorder?.stop() } catch (_: Exception) { }
      }
    }
    // Worker barrier: all final segments exist before drain state is queried.
    if (args.drain) worker.execute { invoke.resolve() } else invoke.resolve()
  }
  @Command fun state(invoke: Invoke) {
    val args = invoke.parseArgs(SensingArgs::class.java)
    invoke.resolve(snapshot(args.take))
  }
  @Command fun acknowledge(invoke: Invoke) {
    val args = invoke.parseArgs(SensingArgs::class.java)
    queue.acknowledge(args.recordingId); invoke.resolve()
  }
  private fun snapshot(take: Boolean): JSObject = synchronized(lock) {
    JSObject().apply {
      put("active", active); put("session_id", requestedSession)
      put("completed_segments", completed); put("queued_segments", queue.size())
      put("dropped_segments", queue.dropped); put("last_error", lastError)
      put("vad_recoveries", vadRecoveries)
      put("audio_level", audioLevel); put("vad_probability", vadProbability)
      put("vad_latency_ms", vadLatencyMs); put("speech_detected", speechDetected)
      put("listening_phase", listeningPhase); put("last_sample_at_ms", lastSampleAtMs)
      put("last_turn_label", lastTurnLabel)
      put("recording", if (take && (active || drainingSession > 0)) queue.take { it.getLong("recording_id") } else null)
    }
  }
  override fun onDestroy(activity: AppCompatActivity) {
    synchronized(lock) { requestedSession = 0; active = false; queue.clearPending(); try { recorder?.stop() } catch (_: Exception) { } }
    worker.execute { acoustic.close(); semantic.close() }; worker.shutdown()
  }
  companion object { private const val TAG = "RealTopiaSensing" }
}
