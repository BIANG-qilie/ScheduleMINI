package com.desktop.schedule

import org.junit.Assert.assertEquals
import org.junit.Test

class BootWatchDecisionTest {
    @Test
    fun reloadsTwiceThenRestartsOnceThenStops() {
        assertEquals(BootAction.Reload, bootDeadlineAction(0, false))
        assertEquals(BootAction.Reload, bootDeadlineAction(1, false))
        assertEquals(BootAction.Restart, bootDeadlineAction(2, false))
        assertEquals(BootAction.GiveUp, bootDeadlineAction(2, true))
        assertEquals(BootAction.GiveUp, bootDeadlineAction(3, true))
    }
}
