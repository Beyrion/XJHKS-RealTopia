package com.realtopia.phone.vad

/** Hysteresis around neural VAD probabilities; packet sizes never define endpoints. */
internal class VadEndpointState {
  var speechDetected: Boolean = false
    private set
  private var speechFrames = 0
  private var trailingSilenceFrames = 0
  private var elapsedFrames = 0
  private var awaitingSpeechAfterSemanticDeferral = false

  data class Decision(val endpoint: Boolean, val reason: String)

  fun accept(probabilities: List<Double>): Decision {
    for (probability in probabilities) {
      if (speechDetected) elapsedFrames += 1
      if (!speechDetected) {
        speechFrames = if (probability >= START_THRESHOLD) speechFrames + 1 else 0
        if (speechFrames >= MIN_SPEECH_FRAMES) speechDetected = true
      } else if (probability >= CONTINUE_THRESHOLD) {
        awaitingSpeechAfterSemanticDeferral = false
        trailingSilenceFrames = 0
      } else if (!awaitingSpeechAfterSemanticDeferral) {
        trailingSilenceFrames += 1
      }
      if (speechDetected && trailingSilenceFrames >= END_SILENCE_FRAMES) {
        return Decision(true, "neural_silence")
      }
      if (speechDetected && elapsedFrames >= MAX_SEGMENT_FRAMES) {
        return Decision(true, "max_duration")
      }
    }
    return Decision(false, "collecting")
  }

  /** Do not reconsider the same silent tail until actual speech resumes. */
  fun deferSemanticEndpoint() {
    trailingSilenceFrames = 0
    awaitingSpeechAfterSemanticDeferral = true
  }

  fun reset() {
    speechDetected = false
    speechFrames = 0
    trailingSilenceFrames = 0
    elapsedFrames = 0
    awaitingSpeechAfterSemanticDeferral = false
  }

  private companion object {
    const val START_THRESHOLD = 0.50
    const val CONTINUE_THRESHOLD = 0.35
    const val MIN_SPEECH_FRAMES = 3 // 96 ms
    const val END_SILENCE_FRAMES = 16 // 512 ms
    const val MAX_SEGMENT_FRAMES = 250 // 8 seconds
  }
}
