package com.realtopia.phone.asr

import com.k2fsa.sherpa.mnn.OfflineSpeakerDiarizationSegment
import com.k2fsa.sherpa.mnn.SpeakerEmbeddingExtractorConfig
import org.junit.Assert.*
import org.junit.Test

class MnnSpeakerApiTest {
  @Test fun segmentConstructorMatchesBundledMnnJni() {
    // Native ProcessImpl looks up (FFI)V; newer ONNX API adds a fourth field.
    val constructor = OfflineSpeakerDiarizationSegment::class.java.getConstructor(
      Float::class.javaPrimitiveType, Float::class.javaPrimitiveType, Int::class.javaPrimitiveType)
    val segment = constructor.newInstance(0.5f, 2.0f, 1)
    assertEquals(0.5f, segment.start, 0f)
    assertEquals(2.0f, segment.end, 0f)
    assertEquals(1, segment.speaker)
    assertEquals("com.k2fsa.sherpa.mnn.OfflineSpeakerDiarizationSegment", segment.javaClass.name)
  }

  @Test fun extractorFieldsMatchMnnNativeConfig() {
    val type = SpeakerEmbeddingExtractorConfig::class.java
    assertEquals(String::class.java, type.getDeclaredField("model").type)
    assertEquals(Int::class.javaPrimitiveType, type.getDeclaredField("numThreads").type)
    assertEquals(Boolean::class.javaPrimitiveType, type.getDeclaredField("debug").type)
    assertEquals(String::class.java, type.getDeclaredField("provider").type)
  }
}
