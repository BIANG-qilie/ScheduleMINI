package com.desktop.schedule

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class DayReplayWindowTest {
    @Test
    fun todayWindowEndsAtNow() {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"))
        calendar.set(2026, Calendar.OCTOBER, 27, 15, 30, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        val now = calendar.timeInMillis
        val window = DayReplayRead.dayWindow(now, 0)
        assertEquals(startOfDay(calendar), window.start)
        assertEquals(now, window.end)
        assertEquals(now, window.queryTime)
    }

    @Test
    fun yesterdayUsesFullLocalDay() {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"))
        calendar.set(2026, Calendar.OCTOBER, 27, 15, 30, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        val now = calendar.timeInMillis
        val window = DayReplayRead.dayWindow(now, 1)
        val expectedStart = startOfDay(calendar).let { todayStart ->
            Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai")).also {
                it.timeInMillis = todayStart
                it.add(Calendar.DAY_OF_YEAR, -1)
            }.timeInMillis
        }
        assertEquals(expectedStart, window.start)
        assertEquals(startOfDay(calendar), window.end)
        assertEquals(window.end - 1, window.queryTime)
        assertTrue(window.end > window.start)
    }

    @Test
    fun clampsOffsetAboveTwo() {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"))
        calendar.set(2026, Calendar.OCTOBER, 27, 9, 0, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        val now = calendar.timeInMillis
        val clamped = DayReplayRead.dayWindow(now, 9)
        val twoDays = DayReplayRead.dayWindow(now, 2)
        assertEquals(twoDays.start, clamped.start)
        assertEquals(twoDays.end, clamped.end)
    }

    private fun startOfDay(source: Calendar): Long {
        val calendar = source.clone() as Calendar
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }
}
