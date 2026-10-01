package com.realtopia.phone.face

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FaceNativeInstrumentedTest {
  @Test
  fun detectsEmbedsAndSkipsRecognitionWithoutFaces() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val target = instrumentation.targetContext
    val detector = copyTargetAsset("face/det_2.5g.mnn", File(target.cacheDir, "det-test.mnn"))
    val recognizer = copyTargetAsset("face/w600k_r50.mnn", File(target.cacheDir, "rec-test.mnn"))
    val native = FaceNative()
    val handle = native.create(detector.absolutePath, recognizer.absolutePath, 6)
    assertTrue("native engine must be created", handle != 0L)
    try {
      val sample = instrumentation.context.assets.open("t1.jpg").use(BitmapFactory::decodeStream)
      val gated = JSONObject(native.analyze(handle, rgba(sample), 0, 160.0f))
      assertEquals("small faces are still reported by SCRFD", 6, gated.getInt("detected_count"))
      assertEquals(0, gated.getInt("eligible_count"))
      assertFalse(gated.getBoolean("recognition_invoked"))
      assertTrue(
        "R50 must not load or run when every detected face is below the size gate",
        gated.getJSONObject("timings").getDouble("recognition_ms") < 1.0,
      )

      val first = JSONObject(native.analyze(handle, rgba(sample), 0, 8.0f))
      val second = JSONObject(native.analyze(handle, rgba(sample), 0, 8.0f))

      assertEquals("SCRFD sample face count", 6, first.getInt("detected_count"))
      assertEquals("all sample faces should pass the gate", 6, first.getInt("eligible_count"))
      assertTrue(first.getBoolean("recognition_invoked"))
      assertEquals(6, first.getJSONArray("faces").length())
      assertEmbeddingSet(first.getJSONArray("faces"))
      assertTrue(
        "repeat inference embeddings must remain stable",
        cosine(firstEmbedding(first), firstEmbedding(second)) > 0.9999,
      )

      val blank = Bitmap.createBitmap(1280, 720, Bitmap.Config.ARGB_8888)
      val empty = JSONObject(native.analyze(handle, blank, 0, 24.0f))
      assertEquals(0, empty.getInt("detected_count"))
      assertEquals(0, empty.getInt("eligible_count"))
      assertFalse(empty.getBoolean("recognition_invoked"))
      assertTrue(
        "recognizer time should be negligible when the detector gate is empty",
        empty.getJSONObject("timings").getDouble("recognition_ms") < 1.0,
      )
      Log.i(
        "RealTopiaFaceTest",
        "sixFaces=${first.getJSONObject("timings")} " +
          "gated=${gated.getJSONObject("timings")} blank=${empty.getJSONObject("timings")}",
      )
      sample.recycle()
      blank.recycle()
    } finally {
      native.destroy(handle)
    }
  }

  private fun copyTargetAsset(path: String, destination: File): File {
    val target = InstrumentationRegistry.getInstrumentation().targetContext
    target.assets.open(path).use { input ->
      FileOutputStream(destination).use { output -> input.copyTo(output, 1024 * 1024) }
    }
    return destination
  }

  private fun rgba(bitmap: Bitmap): Bitmap =
    if (bitmap.config == Bitmap.Config.ARGB_8888) bitmap
    else bitmap.copy(Bitmap.Config.ARGB_8888, false).also { bitmap.recycle() }

  private fun assertEmbeddingSet(faces: JSONArray) {
    for (index in 0 until faces.length()) {
      val embedding = faces.getJSONObject(index).getJSONArray("embedding")
      assertEquals(512, embedding.length())
      var squaredNorm = 0.0
      for (dimension in 0 until embedding.length()) {
        val value = embedding.getDouble(dimension)
        squaredNorm += value * value
      }
      assertTrue(abs(sqrt(squaredNorm) - 1.0) < 1.0e-4)
    }
  }

  private fun firstEmbedding(result: JSONObject): DoubleArray {
    val values = result.getJSONArray("faces").getJSONObject(0).getJSONArray("embedding")
    return DoubleArray(values.length()) { values.getDouble(it) }
  }

  private fun cosine(left: DoubleArray, right: DoubleArray): Double =
    left.indices.sumOf { left[it] * right[it] }
}
