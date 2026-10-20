package com.desktop.schedule.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.io.File
import java.util.Calendar

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
    fun schedule(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()
        am.setInexactRepeating(
            AlarmManager.RTC,
            now + 15 * 60 * 1000,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            pending(context, ScheduleWidgetProvider.ACTION_TICK, 1),
        )
        am.set(
            AlarmManager.RTC,
            nextHour(now),
            pending(context, ScheduleWidgetProvider.ACTION_HOUR, 2),
        )
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pending(context, ScheduleWidgetProvider.ACTION_TICK, 1))
        am.cancel(pending(context, ScheduleWidgetProvider.ACTION_HOUR, 2))
    }

    private fun nextHour(now: Long): Long {
        val cal = Calendar.getInstance()
        cal.timeInMillis = now
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        cal.add(Calendar.HOUR_OF_DAY, 1)
        return cal.timeInMillis
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

    fun requestUpdate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, ScheduleWidgetProvider::class.java)
        val ids = mgr.getAppWidgetIds(component)
        if (ids.isEmpty()) return
        update(context, mgr, ids)
    }

    fun update(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val snapshot = WidgetFiles.read(context)?.let { WidgetRender.parse(it) }
        val now = System.currentTimeMillis()
        for (id in ids) {
            val text = WidgetRender.render(snapshot, WidgetModes.get(context, id), now)
            val narrow = isNarrow(manager, id)
            val layout = if (narrow) R.layout.widget_schedule_narrow else R.layout.widget_schedule
            val views = RemoteViews(context.packageName, layout)
            WidgetRender.bind(views, text, narrow)
            views.setOnClickPendingIntent(R.id.widget_root, openApp(context, id))
            manager.updateAppWidget(id, views)
        }
    }

    /** 不到约四格宽时改成上下两条，避免标题被裁。 */
    fun isNarrow(manager: AppWidgetManager, id: Int): Boolean {
        val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
        return width in 1..219
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
