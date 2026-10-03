package com.realtopia.phone.vad

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VadProbabilityTest {
  @Test fun acceptsFiniteProbabilitiesAndEmptyPartialWindow() {
    assertEquals(listOf(0.0, 0.5, 1.0), finiteVadProbabilities(JSONArray("[0,0.5,1]")))
    assertEquals(emptyList<Double>(), finiteVadProbabilities(JSONArray("[]")))
  }
  @Test fun rejectsNonFiniteOrMalformedNativeOutputForStateReset() {
    for (value in listOf("nan", "NaN", "Infinity", "-Infinity", "bad")) {
      assertNull(finiteVadProbabilities(JSONArray().put(value)))
    }
  }
  @Test fun rejectsOutOfRangeProbability() {
    assertNull(finiteVadProbabilities(JSONArray("[1.1]")))
    assertNull(finiteVadProbabilities(JSONArray("[-0.1]")))
  }
}
