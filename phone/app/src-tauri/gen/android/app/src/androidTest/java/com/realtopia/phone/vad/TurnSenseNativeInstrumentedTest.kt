package com.realtopia.phone.vad

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TurnSenseNativeInstrumentedTest {
  @Test
  fun officialExamplesKeepAllThreeLabelsOnDevice() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val model = TurnSenseModel(context, VadNative())
    model.prepare()
    assertTrue("bundled FP16 model was not extracted", model.artifact.isFile)
    model.use {
      mapOf(
        "complete" to "complete",
        "incomplete" to "incomplete",
        "invalid" to "invalid",
      ).forEach { (fixture, expected) ->
        val pcm = InstrumentationRegistry.getInstrumentation().context.assets
          .open("turnsense/$fixture.pcm").use { it.readBytes() }
        val result = requireNotNull(model.classify(pcm))
        assertEquals(expected, result.label)
        assertTrue(result.probabilities[expectedIndex(expected)] > 0.99)
        assertTrue(result.latencyMs > 0.0)
        Log.i("RealTopiaTurnSenseTest", "$expected $result")
      }
    }
  }

  private fun expectedIndex(label: String) = when (label) {
    "complete" -> 0
    "incomplete" -> 1
    else -> 2
  }
}
