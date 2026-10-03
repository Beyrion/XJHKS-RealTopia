package com.realtopia.phone.mood

import kotlin.math.sqrt

/** Normalized RMS amplitude, not a speech/confidence probability. */
internal object AudioDebugLevels {
  fun rmsPcm16(bytes: ByteArray, count: Int): Double {
    val samples = count.coerceIn(0, bytes.size) / 2
    if (samples == 0) return 0.0
    var energy = 0.0
    for (index in 0 until samples) {
      val value = (bytes[index * 2].toInt() and 255) or (bytes[index * 2 + 1].toInt() shl 8)
      val normalized = value / 32768.0
      energy += normalized * normalized
    }
    return sqrt(energy / samples).coerceIn(0.0, 1.0)
  }
}
