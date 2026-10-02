package com.realtopia.phone.vl

import android.graphics.Bitmap

internal class VlNative {
  external fun create(configPath: String): Long
  external fun analyze(handle: Long, bitmap: Bitmap, prompt: String, maxNewTokens: Int): String
  external fun destroy(handle: Long)

  companion object {
    init {
      System.loadLibrary("MNN")
      System.loadLibrary("MNN_Express")
      System.loadLibrary("MNNOpenCV")
      System.loadLibrary("llm")
      System.loadLibrary("realtopia_vl_jni")
    }
  }
}
