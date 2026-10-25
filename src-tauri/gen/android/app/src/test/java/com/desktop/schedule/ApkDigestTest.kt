package com.desktop.schedule

import java.io.File
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkDigestTest {
  @Test
  fun matchesKnownBytesAndRejectsAShortHash() {
    val file = File.createTempFile("apk-digest", ".bin")
    file.writeText("schedulemini")
    val expected = MessageDigest.getInstance("SHA-256")
      .digest("schedulemini".toByteArray())
      .joinToString("") { "%02x".format(it) }
    assertEquals(expected, ApkDigest.sha256Hex(file))
    assertTrue(ApkDigest.matches(file, expected.uppercase()))
    assertFalse(ApkDigest.matches(file, "abc"))
    assertFalse(ApkDigest.matches(file, "0".repeat(64)))
    file.delete()
  }
}
