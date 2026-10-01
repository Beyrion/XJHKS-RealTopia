package com.realtopia.phone.asr

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AsrNativeInstrumentedTest {
  @Test
  fun transcribesKnownMandarinPcmFasterThanRealtime() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val target = instrumentation.targetContext
    val modelRoot = File(
      target.getExternalFilesDir(null),
      "models/huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN",
    )
    val config = File(modelRoot, "config.json")
    assertTrue("downloaded ASR model must be present", config.isFile)
    val wav = instrumentation.context.assets.open(FIXTURE).use { it.readBytes() }
    val pcm = File(target.cacheDir, "asr-known-speech.pcm")
    pcm.writeBytes(wavData(wav))

    val native = AsrNative()
    val handle = native.create(config.absolutePath)
    assertTrue("native ASR engine must load", handle != 0L)
    try {
      val result = JSONObject(native.transcribe(handle, pcm.absolutePath, 16000, 1, 256))
      assertTrue(result.optString("error"), !result.has("error"))
      val normalized = result.getString("text").replace(Regex("[\\s，。！？,.!?]"), "")
      assertEquals("甚至出现交易几乎停滞的情况", normalized)
      assertTrue("ASR should run faster than realtime", result.getDouble("realtime_factor") < 1.0)
      Log.i(TAG, "ASR_BENCHMARK $result")
    } finally {
      native.destroy(handle)
    }
  }

  private fun wavData(wav: ByteArray): ByteArray {
    require(wav.size >= 44 && String(wav, 0, 4) == "RIFF" && String(wav, 8, 4) == "WAVE")
    var offset = 12
    while (offset + 8 <= wav.size) {
      val name = String(wav, offset, 4)
      val size = ByteBuffer.wrap(wav, offset + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
      val dataOffset = offset + 8
      require(size >= 0 && dataOffset + size <= wav.size) { "invalid WAV chunk" }
      if (name == "data") return wav.copyOfRange(dataOffset, dataOffset + size)
      offset = dataOffset + size + (size and 1)
    }
    error("WAV data chunk not found")
  }

  companion object {
    private const val TAG = "RealTopiaAsrTest"
    private const val FIXTURE = "BAC009S0764W0121.wav"
  }
}
