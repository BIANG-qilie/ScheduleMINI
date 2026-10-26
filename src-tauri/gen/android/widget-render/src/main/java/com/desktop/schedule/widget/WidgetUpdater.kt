package com.desktop.schedule.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.widget.RemoteViews
import java.io.File

object WidgetModes {
    private const val PREFS = "home_widget_mode"

    fun get(context: Context, id: Int): String {
        val mode = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(key(id), "both")
        return if (mode == "self" || mode == "partner" || mode == "both") mode else "both"
    }

    fun set(context: Context, id: Int, mode: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(key(id), mode)
            .apply()
    }

    fun has(context: Context, id: Int): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(key(id))
    }

    fun clear(context: Context, id: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(key(id))
            .apply()
    }

    private fun key(id: Int) = "mode_$id"
}

object WidgetFiles {
    const val FILE_NAME = "widget-snapshot.json"

    fun read(context: Context): String? {
        val file = File(context.dataDir, FILE_NAME)
        if (!file.isFile) return null
        return try {
            file.readText(Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }
}

object WidgetAlarms {
    /** 闹钟比边界晚这一点再响，重算时「此刻」一定已经翻过去。 */
    const val BOUNDARY_SLACK_MS = 500L
    private const val TICK_MS = 15 * 60 * 1000L
    private const val WINDOW_MS = 60 * 1000L
    private const val REQ_TICK = 1
    private const val REQ_BOUNDARY = 2

    /**
     * 两只闹钟，都用 RTC（不唤醒）：熄屏时没人看小组件，亮屏退出 Doze 后系统立刻补发。
     * 边界闹钟落在下一段开始/结束/零点上；能用精确闹钟就精确，否则一分钟窗口。
     * 十五分钟一次的粗闹钟只兜底（改时区、闹钟被系统丢掉）。
     */
    fun schedule(context: Context, snapshot: WidgetSnapshot?, nowMs: Long = System.currentTimeMillis()) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setInexactRepeating(
            AlarmManager.RTC,
            nowMs + TICK_MS,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            pending(context, ScheduleWidgetProvider.ACTION_TICK, REQ_TICK),
        )
        val boundary = pending(context, ScheduleWidgetProvider.ACTION_BOUNDARY, REQ_BOUNDARY)
        val next = WidgetRender.nextBoundary(snapshot, nowMs)
        if (next == null) {
            am.cancel(boundary)
            return
        }
        val at = next + BOUNDARY_SLACK_MS
        if (canExact(am)) {
            am.setExact(AlarmManager.RTC, at, boundary)
        } else {
            am.setWindow(AlarmManager.RTC, at, WINDOW_MS, boundary)
        }
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pending(context, ScheduleWidgetProvider.ACTION_TICK, REQ_TICK))
        am.cancel(pending(context, ScheduleWidgetProvider.ACTION_BOUNDARY, REQ_BOUNDARY))
    }

    private fun canExact(am: AlarmManager): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    }

    private fun pending(context: Context, action: String, request: Int): PendingIntent {
        val intent = Intent(context, ScheduleWidgetProvider::class.java).setAction(action)
        return PendingIntent.getBroadcast(
            context,
            request,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

object WidgetUpdater {
    const val EXTRA_OPEN_NOW = "com.desktop.schedule.widget.OPEN_NOW"

    internal var clock: () -> Long = { System.currentTimeMillis() }

    fun requestUpdate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, ScheduleWidgetProvider::class.java)
        val ids = mgr.getAppWidgetIds(component)
        if (ids.isEmpty()) {
            WidgetAlarms.cancel(context)
            return
        }
        update(context, mgr, ids)
    }

    fun update(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val snapshot = WidgetFiles.read(context)?.let { WidgetRender.parse(it) }
        val now = clock()
        for (id in ids) {
            val text = WidgetRender.render(snapshot, WidgetModes.get(context, id), now)
            val narrow = isNarrow(manager, id)
            val layout = if (narrow) R.layout.widget_schedule_narrow else R.layout.widget_schedule
            val views = RemoteViews(context.packageName, layout)
            WidgetRender.bind(views, text, narrow, isShort(manager, id), isNight(context))
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, id))
            manager.updateAppWidget(id, views)
        }
        if (ids.isNotEmpty()) WidgetAlarms.schedule(context, snapshot, now)
    }

    /** 不到约四格宽时改成上下两条，避免标题被裁。 */
    fun isNarrow(manager: AppWidgetManager, id: Int): Boolean {
        val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        return width in 1..219
    }

    /** 挤在两格高以下时收起「接着」等次要行。 */
    fun isShort(manager: AppWidgetManager, id: Int): Boolean {
        val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
        return height in 1..139
    }

    private fun isNight(context: Context): Boolean {
        val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }

    private fun openApp(context: Context, widgetId: Int): PendingIntent {
        val intent = Intent().apply {
            component = ComponentName(context.packageName, "com.desktop.schedule.MainActivity")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_OPEN_NOW, true)
        }
        return PendingIntent.getActivity(
            context,
            widgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
