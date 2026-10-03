package com.realtopia.phone.asr

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

/** Copy verified MNN assets once per engine load; never reuse stale/partial weights. */
internal object SpeakerModelAssets {
  const val INFERENCE_THREADS = 4
  const val EMBEDDING_FILE = "campplus-zh.mnn"
  val models = listOf(
    Asset(EMBEDDING_FILE, "dbf15cf7ce1ed8c1888649928ad48f01d17888e9d303696aab16f0afe2ae001f"),
    Asset("segmentation.mnn", "3baa4c39e2626e3d4b86d92e7b958702dd9d91360b9ddfb6045d063b87585fba"),
  )

  data class Asset(val file: String, val sha256: String) {
    fun install(root: File, openAsset: () -> InputStream): File {
      val target = File(root, file)
      if (target.isFile && hash(target) == sha256) return target
      val staging = File(root, "$file.part")
      try {
        openAsset().use { input -> staging.outputStream().use { input.copyTo(it) } }
        check(hash(staging) == sha256) { "Speaker MNN checksum mismatch: $file" }
        check(staging.renameTo(target)) { "Cannot install speaker MNN: $file" }
      } finally { if (staging.isFile) staging.delete() }
      return target
    }

    private fun hash(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().buffered().use { input ->
        val bytes = ByteArray(65536)
        while (true) {
          val count = input.read(bytes)
          if (count < 0) break
          digest.update(bytes, 0, count)
        }
      }
      return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
  }
}
