package com.desktop.schedule.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

class ScheduleWidgetProvider : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        if (action in REFRESH_ACTIONS) WidgetUpdater.requestUpdate(context)
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WidgetUpdater.update(context, manager, ids)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle,
    ) {
        WidgetUpdater.update(context, appWidgetManager, intArrayOf(appWidgetId))
    }

    override fun onDisabled(context: Context) {
        WidgetAlarms.cancel(context)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        for (id in ids) WidgetModes.clear(context, id)
    }

    companion object {
        const val ACTION_TICK = "com.desktop.schedule.widget.TICK"
        const val ACTION_BOUNDARY = "com.desktop.schedule.widget.BOUNDARY"

        private val REFRESH_ACTIONS = setOf(
            ACTION_TICK,
            ACTION_BOUNDARY,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_DATE_CHANGED,
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
        )
    }
}
