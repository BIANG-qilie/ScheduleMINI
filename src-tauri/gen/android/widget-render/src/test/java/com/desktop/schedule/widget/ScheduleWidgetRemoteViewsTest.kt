package com.desktop.schedule.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.io.FileOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class ScheduleWidgetRemoteViewsTest {
    @Test
    fun bothLanesShowOvernightAndFreeNext() {
        val now = 1_700_000_000_000L
        val snapshot = WidgetRender.parse(
            """
            {
              "version": 1,
              "untilMs": ${now + 86_400_000L},
              "selfName": "我",
              "partnerName": "对方",
              "selfColor": "#0f766e",
              "partnerColor": "#a21caf",
              "self": [{
                "startMs": ${now - 3_600_000L},
                "endMs": ${now + 3_600_000L},
                "startDate": "2023-11-14",
                "sortKey": "22:00",
                "title": "值夜",
                "time": "22:00–06:00",
                "tag": "工作",
                "tagColor": "#1f8a78"
              }],
              "partner": [{
                "startMs": ${now + 7_200_000L},
                "endMs": ${now + 10_800_000L},
                "startDate": "${today(now)}",
                "sortKey": "18:00",
                "title": "散步",
                "time": "18:00–19:00",
                "tag": "生活",
                "tagColor": "#c47a32"
              }]
            }
            """.trimIndent(),
        )
        val text = WidgetRender.render(snapshot, "both", now)
        assertEquals("双方", text.kicker)
        assertEquals("值夜", text.lanes[0].headline)
        assertEquals("22:00–06:00", text.lanes[0].time)
        assertEquals("工作", text.lanes[0].tag)
        assertEquals("空闲", text.lanes[1].headline)
        assertEquals("下一程 散步 18:00–19:00", text.lanes[1].next)

        val context = RuntimeEnvironment.getApplication()
        val views = RemoteViews(context.packageName, R.layout.widget_schedule)
        WidgetRender.bind(views, text)
        val parent = FrameLayout(context)
        val root = views.apply(context, parent)
        parent.addView(root)

        assertEquals("双方", parent.findViewById<TextView>(R.id.widget_kicker).text.toString())
        assertEquals("值夜", parent.findViewById<TextView>(R.id.self_title).text.toString())
        assertEquals("22:00–06:00", parent.findViewById<TextView>(R.id.self_time).text.toString())
        val tag = parent.findViewById<TextView>(R.id.self_tag)
        assertEquals("工作", tag.text.toString())
        assertEquals(Color.parseColor("#1f8a78"), tag.currentTextColor)
        assertEquals("我", parent.findViewById<TextView>(R.id.self_name).text.toString())
        assertEquals(
            Color.parseColor("#0f766e"),
            parent.findViewById<TextView>(R.id.self_name).currentTextColor,
        )
        assertEquals(View.VISIBLE, parent.findViewById<View>(R.id.lane_divider).visibility)
        assertEquals("空闲", parent.findViewById<TextView>(R.id.partner_title).text.toString())
        assertEquals(View.GONE, parent.findViewById<View>(R.id.partner_time).visibility)
        assertEquals(
            "接着 · 18:00  散步",
            parent.findViewById<TextView>(R.id.partner_next).text.toString(),
        )
        assertEquals(
            Color.parseColor("#a21caf"),
            parent.findViewById<TextView>(R.id.partner_name).currentTextColor,
        )

        val shot = System.getenv("WIDGET_SHOT")
        if (!shot.isNullOrBlank()) {
            val width = 900
            val height = 420
            root.measure(
                View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
            )
            root.layout(0, 0, width, height)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            root.draw(Canvas(bitmap))
            File(shot).parentFile?.mkdirs()
            FileOutputStream(shot).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Test
    fun selfModeHidesPartnerAndFreeShowsNext() {
        val now = 1_700_000_000_000L
        val today = today(now)
        val text = WidgetRender.render(
            WidgetRender.parse(
                """
                {"version":1,"untilMs":${now + 1000},"selfName":"我","partnerName":"对方",
                "selfColor":"#0f766e","partnerColor":"#a21caf",
                "self":[{"startMs":${now + 60_000},"endMs":${now + 120_000},"startDate":"$today","sortKey":"09:00","title":"晨读","time":"09:00–10:00","tag":"学习","tagColor":"#3d7ea6"}],
                "partner":[{"startMs":${now - 10},"endMs":${now + 10},"startDate":"$today","sortKey":"08:00","title":"例会","time":"08:00–09:00","tag":"工作","tagColor":"#1f8a78"}]}
                """.trimIndent(),
            ),
            "self",
            now,
        )
        assertEquals(false, text.empty)
        assertEquals(1, text.lanes.size)
        assertEquals("空闲", text.lanes[0].headline)
        assertEquals("下一程 晨读 09:00–10:00", text.lanes[0].next)

        val context = RuntimeEnvironment.getApplication()
        val views = RemoteViews(context.packageName, R.layout.widget_schedule)
        WidgetRender.bind(views, text)
        val parent = FrameLayout(context)
        parent.addView(views.apply(context, parent))
        assertEquals(View.GONE, parent.findViewById<View>(R.id.lane_partner).visibility)
        assertEquals("自己", parent.findViewById<TextView>(R.id.widget_kicker).text.toString())
        assertEquals("空闲", parent.findViewById<TextView>(R.id.self_title).text.toString())
        assertEquals("接着 · 09:00  晨读", parent.findViewById<TextView>(R.id.self_next).text.toString())
    }

    @Test
    fun busyLaneAlsoShowsNextAndNarrowShortHidesIt() {
        val now = 1_700_000_000_000L
        val today = today(now)
        val text = WidgetRender.render(
            WidgetRender.parse(
                """
                {"version":1,"untilMs":${now + 86_400_000L},"selfName":"我","partnerName":"宝宝",
                "selfColor":"#0f766e","partnerColor":"#a21caf",
                "self":[
                  {"startMs":${now - 60_000},"endMs":${now + 60_000},"startDate":"$today","sortKey":"09:00","title":"晨读","time":"09:00–10:00","tag":"学习","tagColor":"#3d7ea6"},
                  {"startMs":${now + 120_000},"endMs":${now + 180_000},"startDate":"$today","sortKey":"11:00","title":"例会","time":"11:00–12:00","tag":"工作","tagColor":"#1f8a78"}
                ],
                "partner":[]}
                """.trimIndent(),
            ),
            "both",
            now,
        )
        assertEquals("晨读", text.lanes[0].headline)
        assertEquals("下一程 例会 11:00–12:00", text.lanes[0].next)

        val context = RuntimeEnvironment.getApplication()
        val views = RemoteViews(context.packageName, R.layout.widget_schedule_narrow)
        WidgetRender.bind(views, text, narrow = true, short = true)
        val parent = FrameLayout(context)
        parent.addView(views.apply(context, parent))
        assertEquals(View.GONE, parent.findViewById<View>(R.id.self_next).visibility)
        assertEquals(View.GONE, parent.findViewById<View>(R.id.self_meta).visibility)
        assertEquals(View.VISIBLE, parent.findViewById<View>(R.id.lane_rule).visibility)
        assertEquals(1, parent.findViewById<TextView>(R.id.self_title).maxLines)
    }

    @Test
    fun missingSnapshotShowsEmptyState() {
        val text = WidgetRender.render(null, "both", 1_700_000_000_000L)
        assertEquals(true, text.empty)
        assertEquals("打开小日程，日程会出现在这里", text.emptyMessage)
        val context = RuntimeEnvironment.getApplication()
        val views = RemoteViews(context.packageName, R.layout.widget_schedule)
        WidgetRender.bind(views, text)
        val parent = FrameLayout(context)
        parent.addView(views.apply(context, parent))
        assertEquals(View.VISIBLE, parent.findViewById<View>(R.id.widget_empty).visibility)
        assertEquals(View.GONE, parent.findViewById<View>(R.id.widget_body).visibility)
        assertEquals(
            "打开小日程，日程会出现在这里",
            parent.findViewById<TextView>(R.id.widget_empty).text.toString(),
        )
    }

    private fun today(ms: Long): String {
        val cal = java.util.Calendar.getInstance()
        cal.timeInMillis = ms
        return "%04d-%02d-%02d".format(
            cal.get(java.util.Calendar.YEAR),
            cal.get(java.util.Calendar.MONTH) + 1,
            cal.get(java.util.Calendar.DAY_OF_MONTH),
        )
    }
}
