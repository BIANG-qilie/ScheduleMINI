package com.desktop.schedule.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallAllowlistTest {
    private val allowlist = setOf("+8613800138000")

    @Test
    fun plus86WithSpacesMatches() {
        assertEquals(
            "+8613800138000",
            CallAllowlist.normalize("+86 138 0013 8000", null, "CN"),
        )
        assertTrue(
            CallAllowlist.matches(2, 40, "+86 138 0013 8000", null, "CN", allowlist),
        )
    }

    @Test
    fun international00PrefixMatches() {
        assertEquals(
            "+8613800138000",
            CallAllowlist.normalize("008613800138000", null, "CN"),
        )
        assertEquals(
            "+8613800138000",
            CallAllowlist.normalize("0086 138 0013 8000", null, "CN"),
        )
        assertTrue(
            CallAllowlist.matches(1, 8, "008613800138000", null, "CN", allowlist),
        )
    }

    @Test
    fun alreadyFormattedE164Matches() {
        assertEquals(
            "+8613800138000",
            CallAllowlist.normalize("+8613800138000", null, "CN"),
        )
    }

    @Test
    fun cachedNormalizedNumberWins() {
        assertEquals(
            "+8613800138000",
            CallAllowlist.normalize("10086", "+8613800138000", "CN"),
        )
        assertFalse(
            CallAllowlist.matches(
                2,
                30,
                "+86 138 0013 8000",
                "+16502530000",
                "CN",
                allowlist,
            ),
        )
    }

    @Test
    fun emptyNumberIsRejected() {
        assertNull(CallAllowlist.normalize("", null, "CN"))
        assertNull(CallAllowlist.normalize("   ", null, "CN"))
        assertNull(CallAllowlist.normalize(null, null, "CN"))
        assertNull(CallAllowlist.normalize(null, "  ", "CN"))
        assertFalse(CallAllowlist.matches(2, 30, "", null, "CN", allowlist))
    }

    @Test
    fun shortCodeThatCollidesOnTheTailIsRejected() {
        assertNull(CallAllowlist.normalize("10086", null, "CN"))
        assertNull(CallAllowlist.normalize("138001", null, "CN"))
        assertNotEquals(
            "+8613800138000",
            CallAllowlist.normalize("9913800138000", null, "CN"),
        )
        assertFalse(CallAllowlist.matches(2, 12, "138001", null, "CN", allowlist))
        assertFalse(CallAllowlist.matches(1, 12, "10086", null, "CN", allowlist))
    }

    @Test
    fun anotherCountryStaysAnotherCountry() {
        assertEquals(
            "+16502530000",
            CallAllowlist.normalize("+1 650 253 0000", null, "CN"),
        )
        assertFalse(
            CallAllowlist.matches(2, 30, "+1 650 253 0000", null, "CN", allowlist),
        )
    }

    @Test
    fun missedZeroDurationAndEmptyAllowlistAreRejected() {
        assertFalse(CallAllowlist.matches(3, 0, "+8613800138000", null, "CN", allowlist))
        assertFalse(CallAllowlist.matches(3, 30, "+86 138 0013 8000", null, "CN", allowlist))
        assertFalse(CallAllowlist.matches(2, 0, "+86 138 0013 8000", null, "CN", allowlist))
        assertFalse(CallAllowlist.matches(1, 30, "+86 138 0013 8000", null, "CN", emptySet()))
    }
}
