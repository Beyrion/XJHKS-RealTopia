package com.realtopia.phone.vad

import android.app.Activity
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.ArrayDeque
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray

@InvokeArg
class VadChunkArgs {
  lateinit var pcmPath: String
  var recordingId: Long = 0
  var conversationId: Long = 0
  var sequence: Int = 0
  var sampleRate: Int = 16000
  var channels: Int = 1
  var encoding: String = "pcm_s16le"
  var transferMs: Long = 0
}

@TauriPlugin
class RealiaVadPlugin(private val activity: Activity) : Plugin(activity) {
  private data class Chunk(val bytes: ByteArray)

  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val native = VadNative()
  private val acousticModel = SileroVadModel(activity, native)
  private val semanticModel = TurnSenseModel(activity, native)
  private val endpoint = VadEndpointState()
  private val chunks = ArrayDeque<Chunk>()
  private var activeConversationId = -1L
  private var bufferedBytes = 0

  init {
    worker.execute {
      try {
        semanticModel.prepare()
      } catch (error: Exception) {
        Log.e(TAG, "could not prepare bundled TurnSense FP16", error)
      }
    }
  }

  @Command
  fun acceptChunk(invoke: Invoke) {
    val args = invoke.parseArgs(VadChunkArgs::class.java)
    worker.execute {
      try {
        require(args.sampleRate == SAMPLE_RATE && args.channels == 1 && args.encoding == "pcm_s16le") {
          "VAD requires 16 kHz mono PCM16"
        }
        val source = File(args.pcmPath).canonicalFile
        val filesRoot = activity.getExternalFilesDir(null)?.canonicalFile
          ?: throw IllegalStateException("external app storage is unavailable")
        require(source.isFile && source.toPath().startsWith(filesRoot.toPath())) {
          "VAD chunk is outside app storage or missing"
        }
        if (activeConversationId != args.conversationId) resetConversation(args.conversationId)
        val bytes = source.readBytes()
        require(bytes.isNotEmpty() && bytes.size % 2 == 0) { "VAD chunk is empty or malformed" }
        chunks.addLast(Chunk(bytes))
        bufferedBytes += bytes.size

        val acoustic = acousticModel.analyze(source)
        val decision = endpoint.accept(acoustic.probabilities)
        trimLeadingSilence()

        val latencyMs = acoustic.latencyMs
        val probability = acoustic.maxProbability
        var ready = decision.endpoint
        var reason = decision.reason
        var segment: JSObject? = null
        var turnLabel: String? = null
        var turnProbabilities: List<Double> = emptyList()
        var turnLatencyMs = 0.0
        var turnFrontendMs = 0.0
        var turnInferenceMs = 0.0
        if (decision.endpoint && decision.reason == "neural_silence") {
          val semantic = semanticModel.classify(joinedPcm())
          turnLabel = semantic.label
          turnProbabilities = semantic.probabilities
          turnLatencyMs = semantic.latencyMs
          turnFrontendMs = semantic.frontendMs
          turnInferenceMs = semantic.inferenceMs
          when (turnLabel) {
            "complete" -> reason = "semantic_complete"
            "incomplete" -> {
              ready = false
              reason = "semantic_incomplete"
              endpoint.deferSemanticEndpoint()
            }
            "invalid" -> {
              ready = false
              reason = "semantic_invalid_dropped"
              discardBufferedCandidate()
            }
          }
        }
        if (ready) segment = emitSegment(args, reason, latencyMs, turnLabel, turnLatencyMs)
        Log.i(
          TAG,
          "CHUNK conversationId=${args.conversationId} sequence=${args.sequence} " +
            "windows=${acoustic.probabilities.size} maxProbability=$probability vadMs=$latencyMs " +
            "speech=${endpoint.speechDetected} endpoint=$ready turn=$turnLabel reason=$reason",
        )
        val result = JSObject().apply {
          put("ready", ready)
          put("speech_detected", endpoint.speechDetected)
          put("probability", probability)
          put("latency_ms", latencyMs)
          put("reason", reason)
          put("turn_label", turnLabel)
          put("turn_probabilities", JSONArray().apply { turnProbabilities.forEach(::put) })
          put("turn_latency_ms", turnLatencyMs)
          put("turn_frontend_ms", turnFrontendMs)
          put("turn_inference_ms", turnInferenceMs)
          put("segment", segment)
        }
        invoke.resolve(result)
      } catch (error: Exception) {
        Log.e(TAG, "VAD chunk failed", error)
        invoke.reject("local VAD failed: ${error.message ?: error.javaClass.simpleName}")
      }
    }
  }

  private fun emitSegment(
    args: VadChunkArgs,
    reason: String,
    latencyMs: Double,
    turnLabel: String?,
    turnLatencyMs: Double,
  ): JSObject {
    val outputDir = File(activity.getExternalFilesDir(null), "recordings/vad").apply { mkdirs() }
    val output = File(outputDir, "conversation-${args.conversationId}-${args.sequence}.pcm")
    val pcm = joinedPcm()
    output.writeBytes(pcm)
    val durationMs = pcm.size / BYTES_PER_MS
    val segment = JSObject().apply {
      put("recording_id", args.recordingId)
      put("bytes", pcm.size)
      put("sample_rate", SAMPLE_RATE)
      put("channels", 1)
      put("encoding", "pcm_s16le")
      put("duration_ms", durationMs)
      put("transfer_ms", args.transferMs)
      put("path", output.absolutePath)
      put("partial", true)
      put("conversation_id", args.conversationId)
      put("sequence", args.sequence)
      put("chunk", false)
      put("final_chunk", false)
      put("vad_latency_ms", latencyMs)
      put("vad_reason", reason)
      put("turn_label", turnLabel)
      put("turn_latency_ms", turnLatencyMs)
    }
    Log.i(TAG, "ENDPOINT conversationId=${args.conversationId} sequence=${args.sequence} reason=$reason durationMs=$durationMs vadMs=$latencyMs")
    chunks.clear()
    bufferedBytes = 0
    endpoint.reset()
    acousticModel.reset()
    return segment
  }

  private fun joinedPcm(): ByteArray {
    val joined = ByteArrayOutputStream(bufferedBytes)
    chunks.forEach { joined.write(it.bytes) }
    return joined.toByteArray()
  }

  private fun discardBufferedCandidate() {
    chunks.clear()
    bufferedBytes = 0
    endpoint.reset()
    acousticModel.reset()
  }

  private fun trimLeadingSilence() {
    if (endpoint.speechDetected) return
    while (bufferedBytes > MAX_PREROLL_BYTES && chunks.size > 1) {
      bufferedBytes -= chunks.removeFirst().bytes.size
    }
  }

  private fun resetConversation(conversationId: Long) {
    activeConversationId = conversationId
    chunks.clear()
    bufferedBytes = 0
    endpoint.reset()
    acousticModel.reset()
  }

  override fun onDestroy(activity: AppCompatActivity) {
    worker.execute {
      acousticModel.close()
      semanticModel.close()
    }
    worker.shutdown()
  }

  private companion object {
    const val TAG = "RealTopiaVad"
    const val SAMPLE_RATE = 16000
    const val BYTES_PER_MS = 32
    const val MAX_PREROLL_BYTES = SAMPLE_RATE * 2
  }
}
