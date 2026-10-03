package com.realtopia.phone.asr

import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class SpeakerModelAssetsTest {
  private val bytes = "unit fixture, not speaker weights".toByteArray()
  private val hash = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 0xff) }
  private val asset = SpeakerModelAssets.Asset("fixture.mnn", hash)
  private fun withRoot(test: (File) -> Unit) {
    val root = Files.createTempDirectory("speaker-mnn-asset-test-").toFile()
    try { test(root) }
    finally {
      File(root, "fixture.mnn").delete()
      File(root, "fixture.mnn.part").delete()
      root.delete()
    }
  }

  @Test fun copiesVerifiedAssetAndReusesIt() = withRoot { root ->
    var opened = 0
    val open = { opened++; ByteArrayInputStream(bytes) }
    val installed = asset.install(root, open)
    assertArrayEquals(bytes, installed.readBytes())
    assertEquals(installed, asset.install(root, open))
    assertEquals(1, opened)
    assertFalse(File(root, "fixture.mnn.part").exists())
  }

  @Test fun staleOrCorruptCopiedModelIsReplaced() = withRoot { root ->
    File(root, "fixture.mnn").writeText("old weights")
    File(root, "fixture.mnn.part").writeText("interrupted copy")
    assertArrayEquals(bytes, asset.install(root) { ByteArrayInputStream(bytes) }.readBytes())
    assertFalse(File(root, "fixture.mnn.part").exists())
  }

  @Test fun badAssetCannotOverwriteExistingWeights() = withRoot { root ->
    val target = File(root, "fixture.mnn").apply { writeText("existing") }
    try {
      asset.install(root) { ByteArrayInputStream("corrupt".toByteArray()) }
      fail("Expected checksum rejection")
    } catch (e: IllegalStateException) { assertTrue(e.message!!.contains("checksum")) }
    assertEquals("existing", target.readText())
    assertFalse(File(root, "fixture.mnn.part").exists())
  }

  @Test fun onlyUpgradedMnnModelsAreSelected() {
    assertEquals(4, SpeakerModelAssets.INFERENCE_THREADS)
    assertEquals(listOf("campplus-zh.mnn", "segmentation.mnn"), SpeakerModelAssets.models.map { it.file })
    assertTrue(SpeakerModelAssets.models.all { it.sha256.matches(Regex("[0-9a-f]{64}")) })
  }
}
