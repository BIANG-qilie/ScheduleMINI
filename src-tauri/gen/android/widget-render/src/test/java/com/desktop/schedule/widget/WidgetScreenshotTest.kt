package com.desktop.schedule.widget

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import java.util.Calendar

/**
 * 每种模式 × 小（2×2）/ 中（4×2）× 浅/深，外加最小 2×2 的双方。
 * 设 WIDGET_SHOT_DIR 时把 PNG 写到那里，否则写进 build/widget-shots。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "xxhdpi")
class WidgetScreenshotTest {
    private val density = 3

    @Test
    fun renderModesSizesThemes() {
        val now = Calendar.getInstance().apply {
            set(2026, Calendar.OCTOBER, 26, 9, 20, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val today = "2026-10-26"
        val min = 60_000L
        val json = """
            {"version":1,"untilMs":${now + 86_400_000L},"selfName":"我","partnerName":"宝宝",
            "selfColor":"#0f766e","partnerColor":"#a21caf",
            "self":[
              {"startMs":${now - 20 * min},"endMs":${now + 70 * min},"startDate":"$today","sortKey":"09:00","title":"整理季度复盘材料","time":"09:00–10:30","tag":"工作","tagColor":"#1f8a78"},
              {"startMs":${now + 100 * min},"endMs":${now + 160 * min},"startDate":"$today","sortKey":"11:00","title":"和导师讨论论文","time":"11:00–12:00","tag":"学习","tagColor":"#3d7ea6"}
            ],
            "partner":[
              {"startMs":${now + 40 * min},"endMs":${now + 100 * min},"startDate":"$today","sortKey":"10:00","title":"牙医复诊","time":"10:00–11:00","tag":"生活","tagColor":"#c47a32"}
            ]}
        """.trimIndent()
        val out = File(System.getenv("WIDGET_SHOT_DIR") ?: "build/widget-shots")
        out.mkdirs()
        val snapshot = WidgetRender.parse(json)
        for (night in listOf(false, true)) {
            val theme = if (night) "dark" else "light"
            for (mode in listOf("self", "partner", "both")) {
                shot(snapshot, mode, now, 170, 170, night, File(out, "$mode-small-$theme.png"))
                shot(snapshot, mode, now, 340, 180, night, File(out, "$mode-medium-$theme.png"))
            }
            shot(snapshot, "both", now, 120, 120, night, File(out, "both-min-$theme.png"))
        }
    }

    private fun shot(
        snapshot: WidgetSnapshot?,
        mode: String,
        now: Long,
        widthDp: Int,
        heightDp: Int,
        night: Boolean,
        file: File,
    ) {
        val app = RuntimeEnvironment.getApplication()
        val config = Configuration(app.resources.configuration).apply {
            uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
                if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        }
        val context = app.createConfigurationContext(config)
        val narrow = widthDp in 1..219
        val short = heightDp in 1..139
        val layout = if (narrow) R.layout.widget_schedule_narrow else R.layout.widget_schedule
        val views = RemoteViews(app.packageName, layout)
        WidgetRender.bind(views, WidgetRender.render(snapshot, mode, now), narrow, short, night)
        val width = widthDp * density
        val height = heightDp * density
        val pad = 12 * density
        val frame = FrameLayout(context)
        val root = views.apply(context, frame)
        root.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
        )
        root.layout(0, 0, width, height)
        val bitmap = Bitmap.createBitmap(width + pad * 2, height + pad * 2, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(if (night) 0xFF0E0C0A.toInt() else 0xFFD9CEBC.toInt())
        canvas.translate(pad.toFloat(), pad.toFloat())
        root.draw(canvas)
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        check(file.length() > 0) { "$file not written" }
    }
}
