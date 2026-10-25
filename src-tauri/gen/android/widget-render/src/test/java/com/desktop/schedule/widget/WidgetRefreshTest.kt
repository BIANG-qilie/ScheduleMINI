package com.desktop.schedule.widget

import android.app.AlarmManager
import android.content.Intent
import android.widget.TextView
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager
import java.io.File
import java.util.Calendar

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WidgetRefreshTest {
    private val context = RuntimeEnvironment.getApplication()

    /** 当天 09:00，离零点足够远，边界只来自日程本身 */
    private val t0 = Calendar.getInstance().apply {
        set(2026, Calendar.OCTOBER, 26, 9, 0, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    private val t1 = t0 + 60 * 60_000L
    private val t2 = t1 + 30 * 60_000L

    private val json = """
        {"version":1,"untilMs":${t0 + 30L * 86_400_000L},"selfName":"我","partnerName":"宝宝",
        "selfColor":"#0f766e","partnerColor":"#a21caf",
        "self":[
          {"startMs":$t0,"endMs":$t1,"startDate":"2026-10-26","sortKey":"09:00","title":"晨读","time":"09:00–10:00","tag":"学习","tagColor":"#3d7ea6"},
          {"startMs":$t1,"endMs":$t2,"startDate":"2026-10-26","sortKey":"10:00","title":"例会","time":"10:00–10:30","tag":"工作","tagColor":"#1f8a78"}
        ],
        "partner":[]}
    """.trimIndent()

    @Before
    fun setUp() {
        File(context.dataDir, WidgetFiles.FILE_NAME).writeText(json)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
    }

    @After
    fun tearDown() {
        WidgetUpdater.clock = { System.currentTimeMillis() }
    }

    @Test
    fun nextBoundaryIsEarliestStartEndMidnightOrExpiry() {
        val snapshot = WidgetRender.parse(json)
        assertEquals(t1, WidgetRender.nextBoundary(snapshot, t0 + 1))
        assertEquals(t1, WidgetRender.nextBoundary(snapshot, t0))
        assertEquals(t2, WidgetRender.nextBoundary(snapshot, t1))
        val midnight = Calendar.getInstance().apply {
            timeInMillis = t0
            add(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
        }.timeInMillis
        assertEquals(midnight, WidgetRender.nextBoundary(snapshot, t2))
        assertEquals(null, WidgetRender.nextBoundary(null, t0))
    }

    @Test
    fun currentItemFlipsExactlyAtBoundary() {
        val snapshot = WidgetRender.parse(json)
        assertEquals("晨读", WidgetRender.render(snapshot, "self", t1 - 1).lanes[0].headline)
        assertEquals(
            "例会",
            WidgetRender.render(snapshot, "self", t1 + WidgetAlarms.BOUNDARY_SLACK_MS).lanes[0].headline,
        )
        assertEquals(
            WidgetRender.IDLE,
            WidgetRender.render(snapshot, "self", t2 + WidgetAlarms.BOUNDARY_SLACK_MS).lanes[0].headline,
        )
    }

    @Test
    fun updateSchedulesExactAlarmAtNextBoundary() {
        WidgetUpdater.clock = { t0 + 5 * 60_000L }
        val ids = shadowOf(android.appwidget.AppWidgetManager.getInstance(context))
            .createWidgets(ScheduleWidgetProvider::class.java, R.layout.widget_schedule, 1)
        WidgetModes.set(context, ids[0], "self")
        WidgetUpdater.requestUpdate(context)

        val alarm = boundaryAlarm()
        assertEquals(t1 + WidgetAlarms.BOUNDARY_SLACK_MS, alarm.triggerAtMs)
        assertEquals(AlarmManager.RTC, alarm.type)
        assertEquals(0L, alarm.windowLengthMs)
        assertTrue(tickAlarm() != null)
    }

    @Test
    fun boundaryBroadcastRedrawsAndSchedulesTheFollowingBoundary() {
        WidgetUpdater.clock = { t0 + 5 * 60_000L }
        val manager = android.appwidget.AppWidgetManager.getInstance(context)
        val ids = shadowOf(manager)
            .createWidgets(ScheduleWidgetProvider::class.java, R.layout.widget_schedule, 1)
        WidgetModes.set(context, ids[0], "self")
        WidgetUpdater.requestUpdate(context)
        assertEquals("晨读", title(ids[0]))

        WidgetUpdater.clock = { t1 + WidgetAlarms.BOUNDARY_SLACK_MS }
        ScheduleWidgetProvider().onReceive(
            context,
            Intent(context, ScheduleWidgetProvider::class.java)
                .setAction(ScheduleWidgetProvider.ACTION_BOUNDARY),
        )
        assertEquals("例会", title(ids[0]))
        assertEquals(t2 + WidgetAlarms.BOUNDARY_SLACK_MS, boundaryAlarm().triggerAtMs)
    }

    @Test
    fun appWriteNotifiesAndReschedulesForNewSnapshot() {
        WidgetUpdater.clock = { t0 + 5 * 60_000L }
        val manager = android.appwidget.AppWidgetManager.getInstance(context)
        val ids = shadowOf(manager)
            .createWidgets(ScheduleWidgetProvider::class.java, R.layout.widget_schedule, 1)
        WidgetModes.set(context, ids[0], "partner")
        WidgetUpdater.requestUpdate(context)
        val start = t0 + 20 * 60_000L
        File(context.dataDir, WidgetFiles.FILE_NAME).writeText(
            json.replace(
                "\"partner\":[]",
                "\"partner\":[{\"startMs\":$start,\"endMs\":$t2,\"startDate\":\"2026-10-26\",\"sortKey\":\"09:20\",\"title\":\"散步\",\"time\":\"09:20–10:30\",\"tag\":\"生活\",\"tagColor\":\"#c47a32\"}]",
            ),
        )
        // 应用写完快照后经 SmWidget.notifyScheduleChanged 走到这里
        WidgetUpdater.requestUpdate(context)
        assertEquals(WidgetRender.IDLE, title(ids[0]))
        assertEquals(start + WidgetAlarms.BOUNDARY_SLACK_MS, boundaryAlarm().triggerAtMs)
    }

    @Test
    fun withoutExactPermissionFallsBackToShortWindow() {
        ShadowAlarmManager.setCanScheduleExactAlarms(false)
        WidgetUpdater.clock = { t0 + 5 * 60_000L }
        shadowOf(android.appwidget.AppWidgetManager.getInstance(context))
            .createWidgets(ScheduleWidgetProvider::class.java, R.layout.widget_schedule, 1)
        WidgetUpdater.requestUpdate(context)
        val alarm = boundaryAlarm()
        assertEquals(t1 + WidgetAlarms.BOUNDARY_SLACK_MS, alarm.triggerAtMs)
        assertEquals(60_000L, alarm.windowLengthMs)
    }

    @Test
    fun noWidgetsCancelsAlarms() {
        WidgetUpdater.clock = { t0 + 5 * 60_000L }
        WidgetAlarms.schedule(context, WidgetRender.parse(json), t0)
        WidgetUpdater.requestUpdate(context)
        assertEquals(null, find(ScheduleWidgetProvider.ACTION_BOUNDARY))
        assertEquals(null, tickAlarm())
    }

    private fun title(id: Int): String {
        val view = shadowOf(android.appwidget.AppWidgetManager.getInstance(context)).getViewFor(id)
        return view.findViewById<TextView>(R.id.self_title).text.toString()
    }

    private fun boundaryAlarm(): ShadowAlarmManager.ScheduledAlarm {
        val alarm = find(ScheduleWidgetProvider.ACTION_BOUNDARY)
        assertNotNull("boundary alarm", alarm)
        return alarm!!
    }

    private fun tickAlarm() = find(ScheduleWidgetProvider.ACTION_TICK)

    private fun find(action: String): ShadowAlarmManager.ScheduledAlarm? {
        val am = context.getSystemService(AlarmManager::class.java)
        return shadowOf(am).scheduledAlarms.lastOrNull {
            shadowOf(it.operation).savedIntent.action == action
        }
    }
}
