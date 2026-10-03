package com.realtopia.phone.face

import android.graphics.Bitmap

internal class FaceNative {
  external fun create(detectorPath: String, recognizerPath: String, threads: Int): Long
  external fun warmup(handle: Long): String
  external fun analyze(
    handle: Long,
    bitmap: Bitmap,
    rotationDegrees: Int,
    minimumFaceAt640: Float,
  ): String
  external fun destroy(handle: Long)

  companion object {
    init {
      System.loadLibrary("MNN")
      System.loadLibrary("MNN_Express")
      System.loadLibrary("realtopia_face_jni")
    }
  }
}
