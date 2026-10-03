package com.realtopia.phone.asr

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

class ConsecutiveSpeakerClusterTest {
  @Test fun consecutiveTurnsKeepLabels() {
    val cluster = ConsecutiveSpeakerCluster()
    assertEquals("voice-1", cluster.identify(floatArrayOf(1f, 0f), 3000).speakerId)
    assertEquals("voice-2", cluster.identify(floatArrayOf(0f, 1f), 3000).speakerId)
    assertEquals("voice-1", cluster.identify(floatArrayOf(0.98f, 0.1f), 2000).speakerId)
    assertEquals("voice-2", cluster.identify(floatArrayOf(0.1f, 0.98f), 2000).speakerId)
  }
  @Test fun ambiguousVoiceIsNotAssignedOrLearned() {
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f), 2000); c.identify(floatArrayOf(0f, 1f), 2000)
    assertNull(c.identify(floatArrayOf(1f, 1f), 2000).speakerId)
    assertEquals("voice-1", c.identify(floatArrayOf(1f, 0f), 2000).speakerId)
  }
  @Test fun shortOrBrokenSamplesCannotCreateIdentity() {
    val c = ConsecutiveSpeakerCluster()
    for (v in listOf(floatArrayOf(), floatArrayOf(Float.NaN, 0f), floatArrayOf(0f, 0f), floatArrayOf(Float.POSITIVE_INFINITY)))
      assertNull(c.identify(v, 2000).speakerId)
    assertNull(c.identify(floatArrayOf(1f, 0f), 800).speakerId)
    assertEquals("voice-1", c.identify(floatArrayOf(1f, 0f), 2000).speakerId)
    assertNull(c.identify(floatArrayOf(1f), 2000).speakerId)
  }
  @Test fun uncertainSameSpeakerDoesNotInventAnotherPerson() {
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f), 2000)
    assertEquals("uncertain", c.identify(floatArrayOf(0.425f, sqrt(1f - 0.425f * 0.425f)), 2000).decision)
    assertEquals("voice-2", c.identify(floatArrayOf(0f, 1f), 2000).speakerId)
  }
  @Test fun sessionResetStartsFreshLabels() {
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f), 2000); c.reset()
    assertEquals("voice-1", c.identify(floatArrayOf(0f, 1f), 2000).speakerId)
  }
  @Test fun labelCountIsBounded() {
    val c = ConsecutiveSpeakerCluster()
    for (i in 0..3) assertEquals("voice-${i+1}", c.identify(FloatArray(5) { if (it == i) 1f else 0f }, 2000).speakerId)
    assertNull(c.identify(FloatArray(5) { if (it == 4) 1f else 0f }, 2000).speakerId)
  }
  @Test fun matchThresholdIs045AndBoundaryMatches() {
    assertEquals(0.45f, ConsecutiveSpeakerCluster.MATCH_THRESHOLD, 0f)
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f), 2000)
    val match = c.identify(floatArrayOf(0.45f, sqrt(1f - 0.45f * 0.45f)), 2000)
    assertEquals("matched", match.decision)
    assertEquals("voice-1", match.speakerId)
  }
  @Test fun justBelowThresholdRemainsUncertainAndDoesNotCreateLabel() {
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f), 2000)
    val match = c.identify(floatArrayOf(0.449f, sqrt(1f - 0.449f * 0.449f)), 2000)
    assertEquals("uncertain", match.decision)
    assertNull(match.speakerId)
    assertEquals("voice-2", c.identify(floatArrayOf(0f, 1f), 2000).speakerId)
  }
  @Test fun loweredThresholdStillRequiresLeadingMargin() {
    val c = ConsecutiveSpeakerCluster()
    c.identify(floatArrayOf(1f, 0f, 0f), 2000)
    c.identify(floatArrayOf(0f, 1f, 0f), 2000)
    assertNull(c.identify(floatArrayOf(0.55f, 0.50f, sqrt(1f - 0.55f*0.55f - 0.50f*0.50f)), 2000).speakerId)
  }
}
