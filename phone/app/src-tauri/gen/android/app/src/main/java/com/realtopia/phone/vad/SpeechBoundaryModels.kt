package com.realtopia.phone.vad

import android.content.Context
import java.io.File
import java.security.MessageDigest
import org.json.JSONObject

internal data class AcousticVadResult(
  val probabilities: List<Double>,
  val maxProbability: Double,
  val latencyMs: Double,
  val recoveredInvalidState: Boolean = false,
)

internal data class SemanticTurnResult(
  val label: String,
  val probabilities: List<Double>,
  val latencyMs: Double,
  val frontendMs: Double,
  val inferenceMs: Double,
)

/** Owns the bundled Silero MNN module and its recurrent streaming state. */
internal class SileroVadModel(
  private val activity: Context,
  private val native: VadNative,
) : AutoCloseable {
  @Volatile private var handle = 0L

  val loaded: Boolean get() = handle != 0L
  fun warmup() = ensureLoaded()

  fun analyze(pcm: File): AcousticVadResult {
    ensureLoaded()
    val result = JSONObject(native.analyzeVad(handle, pcm.absolutePath))
    checkNativeResult(result, "Silero VAD")
    val values = result.getJSONArray("probabilities")
    val probabilities = finiteVadProbabilities(values)
    // A non-finite recurrent state must not become an endpoint or stop AudioRecord.
    if (probabilities == null) {
      native.resetVad(handle)
      return AcousticVadResult(emptyList(), 0.0, result.optDouble("latency_ms", 0.0), true)
    }
    return AcousticVadResult(
      probabilities = probabilities,
      maxProbability = result.optDouble("max_probability", 0.0),
      latencyMs = result.optDouble("latency_ms", 0.0),
    )
  }

  fun reset() {
    if (handle != 0L) native.resetVad(handle)
  }

  private fun ensureLoaded() {
    if (handle != 0L) return
    val directory = File(activity.noBackupFilesDir, "vad").apply { mkdirs() }
    val target = File(directory, FILE_NAME)
    if (!target.isFile || sha256(target) != SHA256) {
      val temporary = File(directory, "$FILE_NAME.part")
      activity.assets.open(ASSET).use { input -> temporary.outputStream().use(input::copyTo) }
      check(sha256(temporary) == SHA256) { "bundled VAD checksum mismatch" }
      check(temporary.renameTo(target)) { "could not install bundled VAD" }
    }
    handle = native.createVad(target.absolutePath)
    check(handle != 0L) { "MNN could not load Silero VAD" }
  }

  override fun close() {
    if (handle != 0L) native.destroyVad(handle)
    handle = 0L
  }

  companion object {
    const val MODEL_ID = "snakers4/silero-vad-MNN"
    const val FILE_NAME = "silero_vad.mnn"
    const val BYTES = 648_352L
    const val SHA256 = "3ee41c2d2fb3a3d643b28ae72b82a89d74b882907214b09e87bbd7ad978a355f"
    private const val ASSET = "vad/$FILE_NAME"
  }
}

internal fun finiteVadProbabilities(values: org.json.JSONArray): List<Double>? {
  val probabilities = (0 until values.length()).map { values.optDouble(it, Double.NaN) }
  return probabilities.takeIf { it.all { value -> value.isFinite() && value in 0.0..1.0 } }
}

/** Extracts, validates, and owns the FP16 TurnSense model bundled in the APK. */
internal class TurnSenseModel(
  private val activity: Context,
  private val native: VadNative,
) : AutoCloseable {
  @Volatile private var handle = 0L

  val loaded: Boolean get() = handle != 0L
  fun warmup() = ensureLoaded()

  val artifact: File
    get() = File(activity.noBackupFilesDir, "turnsense/$FILE_NAME")

  /** Copies the uncompressed APK asset once so MNN can memory-map a real file. */
  fun prepare() {
    val target = artifact
    if (target.isFile && target.length() == BYTES && sha256(target) == SHA256) return
    target.parentFile?.mkdirs()
    val temporary = File(target.parentFile, "$FILE_NAME.part")
    activity.assets.open(ASSET).use { input -> temporary.outputStream().use(input::copyTo) }
    check(temporary.length() == BYTES && sha256(temporary) == SHA256) {
      "bundled TurnSense FP16 checksum mismatch"
    }
    if (target.exists()) check(target.delete()) { "could not replace TurnSense FP16" }
    check(temporary.renameTo(target)) { "could not install bundled TurnSense FP16" }
  }

  fun classify(pcm: ByteArray): SemanticTurnResult {
    ensureLoaded()
    val result = JSONObject(native.classifyTurn(handle, pcm))
    checkNativeResult(result, "TurnSense")
    val values = result.getJSONArray("probabilities")
    return SemanticTurnResult(
      label = result.getString("label"),
      probabilities = (0 until values.length()).map(values::getDouble),
      latencyMs = result.optDouble("latency_ms", 0.0),
      frontendMs = result.optDouble("frontend_ms", 0.0),
      inferenceMs = result.optDouble("inference_ms", 0.0),
    )
  }

  private fun ensureLoaded() {
    if (handle != 0L) return
    prepare()
    val directory = File(activity.noBackupFilesDir, "turnsense").apply { mkdirs() }
    val cmvn = File(directory, CMVN_FILE)
    if (!cmvn.isFile || sha256(cmvn) != CMVN_SHA256) {
      val temporary = File(directory, "$CMVN_FILE.part")
      activity.assets.open(CMVN_ASSET).use { input -> temporary.outputStream().use(input::copyTo) }
      check(sha256(temporary) == CMVN_SHA256) { "TurnSense CMVN checksum mismatch" }
      check(temporary.renameTo(cmvn)) { "could not install TurnSense CMVN" }
    }
    handle = native.createTurnSense(artifact.absolutePath, cmvn.absolutePath)
    check(handle != 0L) { "MNN could not load TurnSense FP16" }
  }

  override fun close() {
    if (handle != 0L) native.destroyTurnSense(handle)
    handle = 0L
  }

  companion object {
    const val MODEL_ID = "Baiji-Team/TurnSense-MNN-FP16"
    const val FILE_NAME = "turnsense_fp16.mnn"
    const val BYTES = 100_951_104L
    const val SHA256 = "3a7738a51dc9ebeec00f7eb6cb456eaf77f8d62fa44f0bbf72e02f3a523243a9"
    const val CMVN_FILE = "am.mvn"
    const val CMVN_SHA256 = "29b3c740a2c0cfc6b308126d31d7f265fa2be74f3bb095cd2f143ea970896ae5"
    private const val CMVN_ASSET = "turnsense/$CMVN_FILE"
    private const val ASSET = "turnsense/$FILE_NAME"
  }
}

private fun checkNativeResult(result: JSONObject, model: String) {
  if (result.has("error")) throw IllegalStateException("$model: ${result.getString("error")}")
}

internal fun sha256(file: File): String {
  val digest = MessageDigest.getInstance("SHA-256")
  file.inputStream().buffered(1024 * 1024).use { input ->
    val buffer = ByteArray(1024 * 1024)
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      digest.update(buffer, 0, count)
    }
  }
  return digest.digest().joinToString("") { "%02x".format(it) }
}
