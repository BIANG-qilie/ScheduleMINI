package com.desktop.schedule

import org.junit.Assert.assertEquals
import org.junit.Test

class DayReplayLabelTest {
    @Test
    fun prefersDisplayName() {
        assertEquals("微信", DayReplayRead.resolveAppLabel("微信", "com.tencent.mm"))
    }

    @Test
    fun fallsBackToPackageLastSegment() {
        assertEquals("mm", DayReplayRead.resolveAppLabel("", "com.tencent.mm"))
        assertEquals("chrome", DayReplayRead.resolveAppLabel("  ", "com.android.chrome"))
    }
}
