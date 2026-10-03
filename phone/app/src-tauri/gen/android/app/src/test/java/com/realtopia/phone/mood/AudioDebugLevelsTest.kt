package com.realtopia.phone.mood

import org.junit.Assert.assertEquals
import org.junit.Test

class AudioDebugLevelsTest {
  @Test fun silenceAndEmptyHaveZeroLevel() {
    assertEquals(0.0, AudioDebugLevels.rmsPcm16(ByteArray(10), 10), 0.0)
    assertEquals(0.0, AudioDebugLevels.rmsPcm16(ByteArray(0), 0), 0.0)
  }
  @Test fun littleEndianAndNegativeSamplesAreNormalized() {
    assertEquals(0.5, AudioDebugLevels.rmsPcm16(byteArrayOf(0, 64, 0, -64), 4), 0.00001)
    assertEquals(1.0, AudioDebugLevels.rmsPcm16(byteArrayOf(0, -128), 2), 0.00001)
  }
  @Test fun ignoresUnreadBytesAndIncompleteSample() {
    assertEquals(0.5, AudioDebugLevels.rmsPcm16(byteArrayOf(0, 64, 127, 127), 3), 0.00001)
    assertEquals(0.0, AudioDebugLevels.rmsPcm16(byteArrayOf(127), 1), 0.0)
  }
}
