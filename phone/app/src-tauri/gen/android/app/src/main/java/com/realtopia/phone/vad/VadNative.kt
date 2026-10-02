package com.realtopia.phone.vad

internal class VadNative {
  external fun createVad(modelPath: String): Long
  external fun analyzeVad(handle: Long, pcmPath: String): String
  external fun resetVad(handle: Long)
  external fun destroyVad(handle: Long)
  external fun createTurnSense(modelPath: String, cmvnPath: String): Long
  external fun classifyTurn(handle: Long, pcm: ByteArray): String
  external fun destroyTurnSense(handle: Long)

  companion object {
    init {
      System.loadLibrary("MNN")
      System.loadLibrary("MNN_Express")
      System.loadLibrary("realtopia_asr_jni")
    }
  }
}
