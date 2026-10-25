package com.desktop.schedule

import java.io.File
import java.security.MessageDigest

/** APK 字节的 SHA-256。期望值不是 64 位十六进制时视为不匹配，避免跳过校验。 */
object ApkDigest {
  fun sha256Hex(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buf = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        if (n > 0) digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  fun matches(file: File, expectedHex: String): Boolean {
    val expected = expectedHex.trim().lowercase()
    if (!expected.matches(Regex("^[0-9a-f]{64}$"))) return false
    val actual = sha256Hex(file).toByteArray(Charsets.US_ASCII)
    return MessageDigest.isEqual(actual, expected.toByteArray(Charsets.US_ASCII))
  }
}
