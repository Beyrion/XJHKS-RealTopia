package com.realtopia.phone.asr

import kotlin.math.sqrt

/** Session-local labels, not identities. Never learn ambiguous/short samples. */
internal class ConsecutiveSpeakerCluster {
  companion object { const val MATCH_THRESHOLD = 0.45f }
  data class Match(val speakerId: String?, val score: Float?, val decision: String)
  private val centroids = mutableListOf<FloatArray>()
  fun reset() = centroids.clear()
  fun identify(embedding: FloatArray, durationMs: Int): Match {
    if (durationMs < 1000) return Match(null, null, "too_short")
    val norm = sqrt(embedding.sumOf { it.toDouble() * it })
    if (embedding.isEmpty() || embedding.any { !it.isFinite() } || !norm.isFinite() || norm < 1e-6)
      return Match(null, null, "invalid_embedding")
    val vector = FloatArray(embedding.size) { (embedding[it] / norm).toFloat() }
    if (centroids.any { it.size != vector.size }) return Match(null, null, "invalid_embedding")
    val scores = centroids.mapIndexed { i, c -> i to c.indices.sumOf { (c[it] * vector[it]).toDouble() }.toFloat() }
      .sortedByDescending { it.second }
    val best = scores.firstOrNull()
    val margin = if (scores.size > 1) best!!.second - scores[1].second else 1f
    // Conservative starting thresholds, not calibrated probability estimates.
    if (best != null && best.second >= MATCH_THRESHOLD && margin >= 0.10f)
      return Match("voice-${best.first + 1}", best.second, "matched")
    if (centroids.size < 4 && (best == null || best.second < 0.40f)) {
      centroids.add(vector)
      return Match("voice-${centroids.size}", best?.second, "new")
    }
    return Match(null, best?.second, "uncertain")
  }
}
