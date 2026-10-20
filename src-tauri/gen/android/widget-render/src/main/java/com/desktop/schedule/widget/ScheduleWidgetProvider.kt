package com.desktop.schedule.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

class ScheduleWidgetProvider : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        if (
            action == ACTION_TICK ||
            action == ACTION_HOUR ||
            action == Intent.ACTION_BOOT_COMPLETED
        ) {
            WidgetUpdater.requestUpdate(context)
            WidgetAlarms.schedule(context)
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        WidgetUpdater.update(context, manager, ids)
        WidgetAlarms.schedule(context)
    }

    override fun onEnabled(context: Context) {
        WidgetAlarms.schedule(context)
    }

    override fun onDisabled(context: Context) {
        WidgetAlarms.cancel(context)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        for (id in ids) WidgetModes.clear(context, id)
    }

    companion object {
        const val ACTION_TICK = "com.desktop.schedule.widget.TICK"
        const val ACTION_HOUR = "com.desktop.schedule.widget.HOUR"
    }
}
