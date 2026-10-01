package com.realtopia.phone.asr

internal class AsrNative {
  external fun create(configPath: String): Long
  external fun transcribe(
    handle: Long,
    pcmPath: String,
    sampleRate: Int,
    channels: Int,
    maxNewTokens: Int,
  ): String
  external fun destroy(handle: Long)

  companion object {
    init {
      System.loadLibrary("MNN")
      System.loadLibrary("MNN_Express")
      System.loadLibrary("MNNAudio")
      System.loadLibrary("llm")
      System.loadLibrary("realtopia_asr_jni")
    }
  }
}
