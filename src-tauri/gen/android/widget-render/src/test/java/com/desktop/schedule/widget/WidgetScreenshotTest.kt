package com.desktop.schedule.widget

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

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "xxhdpi")
class WidgetScreenshotTest {
    @Test
    fun renderThreeModes() {
        val now = 1_700_000_000_000L
        val until = now + 86_400_000L
        val base = """
            "version": 1,
            "untilMs": $until,
            "selfName": "乖乖",
            "partnerName": "宝宝",
            "selfColor": "#0f766e",
            "partnerColor": "#a21caf"
        """.trimIndent()
        val selfItem = item(
            startMs = now - 60_000,
            endMs = now + 1_800_000,
            sortKey = "09:00",
            title = "晨读",
            time = "09:00–10:00",
            tag = "学习",
            tagColor = "#3d7ea6",
        )
        val partnerItem = item(
            startMs = now - 120_000,
            endMs = now + 3_600_000,
            sortKey = "09:00",
            title = "例会",
            time = "09:00–11:00",
            tag = "工作",
            tagColor = "#1f8a78",
        )
        val night = item(
            startMs = now - 3_600_000,
            endMs = now + 3_600_000,
            sortKey = "22:00",
            title = "值夜",
            time = "22:00–06:00",
            tag = "工作",
            tagColor = "#1f8a78",
        )
        val call = item(
            startMs = now - 30_000,
            endMs = now + 1_200_000,
            sortKey = "20:00",
            title = "晚安电话",
            time = "20:00–20:40",
            tag = "通话",
            tagColor = "#c45d6e",
        )

        render(
            """{$base,"self":[$selfItem],"partner":[]}""",
            "self",
            now,
            R.layout.widget_schedule,
            false,
            1080,
            450,
            "/cursor/stores/self/media/android-widget-self.png",
        )
        render(
            """{$base,"self":[],"partner":[$partnerItem]}""",
            "partner",
            now,
            R.layout.widget_schedule,
            false,
            1080,
            450,
            "/cursor/stores/self/media/android-widget-partner.png",
        )
        render(
            """{$base,"self":[$night],"partner":[$call]}""",
            "both",
            now,
            R.layout.widget_schedule,
            false,
            1200,
            520,
            "/cursor/stores/self/media/android-widget-both.png",
        )
        render(
            """{$base,"self":[$night],"partner":[$call]}""",
            "both",
            now,
            R.layout.widget_schedule_narrow,
            true,
            480,
            780,
            "/cursor/stores/self/media/android-widget-both-narrow.png",
        )
    }

    private fun render(
        json: String,
        mode: String,
        now: Long,
        layout: Int,
        narrow: Boolean,
        width: Int,
        height: Int,
        path: String,
    ) {
        val context = RuntimeEnvironment.getApplication()
        val snapshot = WidgetRender.parse(json)
        val text = WidgetRender.render(snapshot, mode, now)
        val views = RemoteViews(context.packageName, layout)
        WidgetRender.bind(views, text, narrow)
        val parent = FrameLayout(context)
        val root = views.apply(context, parent)
        val widthSpec = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY)
        val heightSpec = View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        root.measure(widthSpec, heightSpec)
        root.layout(0, 0, width, height)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        root.draw(canvas)
        val file = File(path)
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        var ink = 0
        val step = 8
        var y = 0
        while (y < height) {
            var x = 0
            while (x < width) {
                val pixel = bitmap.getPixel(x, y)
                val r = (pixel shr 16) and 0xff
                val g = (pixel shr 8) and 0xff
                val b = pixel and 0xff
                if (r + g + b > 40) ink++
                x += step
            }
            y += step
        }
        check(ink > 80) { "$path barely painted ($ink light samples)" }
    }

    private fun item(
        startMs: Long,
        endMs: Long,
        sortKey: String,
        title: String,
        time: String,
        tag: String,
        tagColor: String,
    ): String {
        return """{"startMs":$startMs,"endMs":$endMs,"startDate":"2023-11-14","sortKey":"$sortKey","title":"$title","time":"$time","tag":"$tag","tagColor":"$tagColor"}"""
    }
}
