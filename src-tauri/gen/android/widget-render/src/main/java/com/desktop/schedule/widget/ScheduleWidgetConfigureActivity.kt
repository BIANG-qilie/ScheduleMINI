package com.desktop.schedule.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.RadioButton
import androidx.appcompat.app.AppCompatActivity

class ScheduleWidgetConfigureActivity : AppCompatActivity() {
    private var widgetId: Int = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)
        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContentView(R.layout.activity_widget_config)
        val self = findViewById<RadioButton>(R.id.mode_self)
        val partner = findViewById<RadioButton>(R.id.mode_partner)
        val both = findViewById<RadioButton>(R.id.mode_both)
        val save = findViewById<Button>(R.id.mode_save)
        when (WidgetModes.get(this, widgetId)) {
            "self" -> self.isChecked = true
            "partner" -> partner.isChecked = true
            else -> both.isChecked = true
        }
        if (WidgetModes.has(this, widgetId)) {
            save.setText(R.string.widget_config_done)
        }

        save.setOnClickListener {
            val mode = when {
                self.isChecked -> "self"
                partner.isChecked -> "partner"
                else -> "both"
            }
            WidgetModes.set(this, widgetId, mode)
            val manager = AppWidgetManager.getInstance(this)
            WidgetUpdater.update(this, manager, intArrayOf(widgetId))
            setResult(
                Activity.RESULT_OK,
                Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
            )
            finish()
        }
    }
}
