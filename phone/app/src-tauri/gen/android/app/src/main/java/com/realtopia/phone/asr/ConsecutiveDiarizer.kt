package com.realtopia.phone.asr

import android.app.Activity
import android.os.SystemClock
import app.tauri.plugin.JSObject
import com.k2fsa.sherpa.mnn.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Offline turn segmentation. No source separation, face inference or persistent voiceprints. */
internal class ConsecutiveDiarizer(private val activity: Activity) {
  private var diarizer: OfflineSpeakerDiarization? = null
  private var extractor: SpeakerEmbeddingExtractor? = null
  private val clusters = ConsecutiveSpeakerCluster()
  private var session = 0L
  private val pendingFiles = mutableSetOf<String>()

  fun warmup(): JSObject {
    val reused = diarizer != null
    val started = SystemClock.elapsedRealtime()
    if (!reused) {
      // Exact obsolete model targets only; preserve gallery, ASR, recordings and user data.
      val legacy = File(activity.filesDir, "speaker-models-v1")
      for (name in arrayOf("campplus-zh.onnx", "segmentation.int8.onnx", "campplus-zh.onnx.part", "segmentation.int8.onnx.part")) {
        File(legacy, name).takeIf { it.isFile }?.delete()
      }
      if (legacy.isDirectory && legacy.list()?.isEmpty() == true) legacy.delete()
      // Filenames and verified hashes prevent reusing the wrong model on upgrades/rollbacks.
      val root = File(activity.filesDir, "speaker-models-mnn-v2").apply { mkdirs() }
      SpeakerModelAssets.models.forEach { model ->
        model.install(root) { activity.assets.open("speaker/${model.file}") }
      }
      val embedding = SpeakerEmbeddingExtractorConfig(model = File(root, SpeakerModelAssets.EMBEDDING_FILE).absolutePath, numThreads = SpeakerModelAssets.INFERENCE_THREADS)
      val created = OfflineSpeakerDiarization(config = OfflineSpeakerDiarizationConfig(
        segmentation = OfflineSpeakerSegmentationModelConfig(
          pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(model = File(root, "segmentation.mnn").absolutePath), numThreads = SpeakerModelAssets.INFERENCE_THREADS),
        embedding = embedding,
        clustering = FastClusteringConfig(threshold = 0.5f),
        minDurationOn = 0.3f, minDurationOff = 0.3f,
      ))
      try { extractor = SpeakerEmbeddingExtractor(config = embedding); diarizer = created }
      catch (e: Exception) { created.release(); throw e }
    }
    return JSObject().apply {
      put("loaded", true); put("reused", reused); put("load_ms", if (reused) 0 else SystemClock.elapsedRealtime() - started)
      put("embedding_model", "CAM++ Chinese · MNN"); put("embedding_sha256", SpeakerModelAssets.models.first().sha256)
      put("inference_threads", SpeakerModelAssets.INFERENCE_THREADS)
      put("match_threshold", ConsecutiveSpeakerCluster.MATCH_THRESHOLD)
    }
  }

  fun process(path: String, sampleRate: Int, channels: Int, sessionId: Long): JSObject {
    require(sampleRate == 16000 && channels == 1 && sessionId > 0) { "Speakers require mono 16kHz PCM and a session" }
    val source = File(path).canonicalFile
    val root = activity.getExternalFilesDir(null)!!.canonicalFile
    require(source.isFile && source.toPath().startsWith(root.toPath()) && source.length() in 2..2_048_000 && source.length() % 2 == 0L) { "Invalid speaker audio path/size" }
    val prepared = warmup()
    if (session != sessionId) { cleanup(); session = sessionId; clusters.reset() }
    val started = SystemClock.elapsedRealtime()
    val pcm = source.readBytes()
    val shorts = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val samples = FloatArray(pcm.size / 2) { shorts.get().toFloat() / 32768f }
    val raw = diarizer!!.process(samples).sortedBy { it.start }
    val turns = JSONArray()
    val output = File(root, "recordings/speakers").apply { mkdirs() }
    for ((index, segment) in raw.withIndex()) {
      val from = (segment.start * sampleRate).toInt().coerceIn(0, samples.size)
      val to = (segment.end * sampleRate).toInt().coerceIn(from, samples.size)
      if (to <= from) continue
      val duration = (to - from) * 1000 / sampleRate
      val overlapping = raw.any { it !== segment && it.start < segment.end && it.end > segment.start }
      val match = if (overlapping) ConsecutiveSpeakerCluster.Match(null, null, "overlap")
        else if (duration < 1000) ConsecutiveSpeakerCluster.Match(null, null, "too_short")
        else {
          val stream = extractor!!.createStream()
          try {
            stream.acceptWaveform(samples.copyOfRange(from, to), sampleRate); stream.inputFinished()
            if (extractor!!.isReady(stream)) clusters.identify(extractor!!.compute(stream), duration)
            else ConsecutiveSpeakerCluster.Match(null, null, "uncertain")
          } finally { stream.release() }
        }
      val file = File(output, "turn-$sessionId-${SystemClock.elapsedRealtimeNanos()}-$index.pcm")
      file.outputStream().use { it.write(pcm, from * 2, (to - from) * 2) }
      pendingFiles.add(file.canonicalPath)
      turns.put(JSObject().apply {
        put("speaker_id", match.speakerId ?: JSONObject.NULL); put("decision", match.decision); put("similarity", match.score ?: JSONObject.NULL)
        put("start_ms", from * 1000 / sampleRate); put("end_ms", to * 1000 / sampleRate)
        put("path", file.absolutePath); put("bytes", (to - from) * 2); put("duration_ms", duration)
      })
    }
    // Do not silently lose speech when segmentation yields nothing.
    if (turns.length() == 0) turns.put(JSObject().apply {
      put("speaker_id", JSONObject.NULL); put("decision", "uncertain"); put("similarity", JSONObject.NULL)
      put("start_ms", 0); put("end_ms", samples.size * 1000 / sampleRate)
      put("path", source.absolutePath); put("bytes", pcm.size); put("duration_ms", samples.size * 1000 / sampleRate)
    })
    return JSObject().apply { put("turns", turns); put("session_id", sessionId); put("latency_ms", SystemClock.elapsedRealtime() - started); put("model_reused", prepared.getBoolean("reused")); put("scope", "consecutive-only") }
  }

  fun cleanup() { pendingFiles.forEach { File(it).delete() }; pendingFiles.clear() }
  fun resetSession() { clusters.reset(); session = 0L }
  fun release() { cleanup(); clusters.reset(); diarizer?.release(); extractor?.release(); diarizer = null; extractor = null }
}
