package com.realtopia.phone.vad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VadEndpointStateTest {
  @Test fun longIdleDoesNotForceFirstSpokenWordToEndImmediately() {
    val state = VadEndpointState()
    state.accept(List(2000) { 0.01 })
    assertFalse(state.accept(List(10) { 0.9 }).endpoint)
    assertTrue(state.accept(List(16) { 0.01 }).endpoint)
  }
  @Test
  fun silenceDoesNotCreateAnEndpoint() {
    val state = VadEndpointState()
    assertFalse(state.accept(List(40) { 0.02 }).endpoint)
    assertFalse(state.speechDetected)
  }

  @Test
  fun speechFollowedByHalfSecondSilenceCreatesEndpoint() {
    val state = VadEndpointState()
    assertFalse(state.accept(List(8) { 0.91 }).endpoint)
    val decision = state.accept(List(16) { 0.04 })
    assertTrue(decision.endpoint)
    assertEquals("neural_silence", decision.reason)
  }

  @Test
  fun shortNoiseSpikeIsRejected() {
    val state = VadEndpointState()
    assertFalse(state.accept(listOf(0.8, 0.9) + List(20) { 0.01 }).endpoint)
    assertFalse(state.speechDetected)
  }

  @Test
  fun semanticDeferralWaitsForNewSpeechBeforeAnotherEndpoint() {
    val state = VadEndpointState()
    state.accept(List(8) { 0.91 })
    assertTrue(state.accept(List(16) { 0.04 }).endpoint)
    state.deferSemanticEndpoint()
    assertFalse(state.accept(List(64) { 0.02 }).endpoint)
    assertFalse(state.accept(List(6) { 0.92 }).endpoint)
    assertTrue(state.accept(List(16) { 0.03 }).endpoint)
  }
}
