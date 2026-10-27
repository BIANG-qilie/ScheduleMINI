package com.desktop.schedule

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.CallLog
import android.provider.Settings
import android.telephony.TelephonyManager
import android.webkit.JavascriptInterface
import com.desktop.schedule.widget.CallAllowlist
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

class DayReplayBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun readToday(): String = DayReplayRead.read(activity, 0)

    /** dayOffset: 0=今天，1=昨天，2=前天（与网页补录一致）。 */
    @JavascriptInterface
    fun readDay(dayOffset: Int): String = DayReplayRead.read(activity, dayOffset)

    @JavascriptInterface
    fun requestAccess() {
        activity.runOnUiThread { DayReplayRead.requestAccess(activity) }
    }
}

internal object DayReplayRead {
    const val MAX_DAY_OFFSET = 2

    fun read(context: Context, dayOffset: Int = 0): String {
        if (!hasUsageAccess(context) || !hasCallLog(context)) {
            return JSONObject().put("ok", false).put("reason", "permission").toString()
        }
        return try {
            val now = System.currentTimeMillis()
            val offset = dayOffset.coerceIn(0, MAX_DAY_OFFSET)
            val window = dayWindow(now, offset)
            val country = deviceCountryIso(context)
            val root = JSONObject()
            root.put("ok", true)
            root.put("queryTime", window.queryTime)
            root.put("events", usageEvents(context, window.start, window.end))
            root.put("calls", callRows(context, window.start, window.end, country))
            root.toString()
        } catch (_: SecurityException) {
            JSONObject().put("ok", false).put("reason", "permission").toString()
        } catch (_: RuntimeException) {
            JSONObject().put("ok", false).put("reason", "read-failed").toString()
        }
    }

    data class DayWindow(val start: Long, val end: Long, val queryTime: Long)

    /** Visible for unit tests: local calendar window for today / yesterday / day before. */
    fun dayWindow(now: Long, dayOffset: Int): DayWindow {
        val offset = dayOffset.coerceIn(0, MAX_DAY_OFFSET)
        val startCal = Calendar.getInstance()
        startCal.timeInMillis = now
        startCal.add(Calendar.DAY_OF_YEAR, -offset)
        startCal.set(Calendar.HOUR_OF_DAY, 0)
        startCal.set(Calendar.MINUTE, 0)
        startCal.set(Calendar.SECOND, 0)
        startCal.set(Calendar.MILLISECOND, 0)
        val start = startCal.timeInMillis
        val endCal = Calendar.getInstance()
        endCal.timeInMillis = start
        endCal.add(Calendar.DAY_OF_YEAR, 1)
        val nextMidnight = endCal.timeInMillis
        return if (offset == 0) {
            DayWindow(start = start, end = now, queryTime = now)
        } else {
            DayWindow(start = start, end = nextMidnight, queryTime = nextMidnight - 1)
        }
    }

    fun requestAccess(activity: MainActivity) {
        if (!hasCallLog(activity)) {
            activity.requestPermissions(arrayOf(Manifest.permission.READ_CALL_LOG), 4101)
        }
        if (!hasUsageAccess(activity)) {
            activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
    }

    private fun hasCallLog(context: Context): Boolean {
        return context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun hasUsageAccess(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
            ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun deviceCountryIso(context: Context): String {
        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        val sim = try {
            telephony?.simCountryIso
        } catch (_: SecurityException) {
            null
        }
        val network = try {
            telephony?.networkCountryIso
        } catch (_: SecurityException) {
            null
        }
        val raw = listOf(sim, network, Locale.getDefault().country)
            .firstOrNull { !it.isNullOrBlank() }
            .orEmpty()
        return raw.uppercase(Locale.US)
    }

    private fun usageEvents(context: Context, start: Long, end: Long): JSONArray {
        val array = JSONArray()
        val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return array
        val events = manager.queryEvents(start, end) ?: return array
        val event = UsageEvents.Event()
        val labels = HashMap<String, String>()
        val packages = context.packageManager
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.timeStamp > end) continue
            val packageName = event.packageName ?: ""
            val row = JSONObject()
            row.put("type", event.eventType)
            row.put("packageName", packageName)
            row.put("timestamp", event.timeStamp)
            row.put("label", appLabel(packages, labels, packageName))
            array.put(row)
        }
        return array
    }

    /** Visible for unit tests: prefer PackageManager label, else package last segment. */
    fun resolveAppLabel(display: String, packageName: String): String {
        val trimmed = display.trim()
        if (trimmed.isNotEmpty()) return trimmed
        return packageName.substringAfterLast('.').ifBlank { packageName }
    }

    private fun appLabel(
        packages: PackageManager,
        cache: MutableMap<String, String>,
        packageName: String,
    ): String {
        if (packageName.isBlank()) return ""
        cache[packageName]?.let { return it }
        val display = try {
            val info = packages.getApplicationInfo(packageName, 0)
            packages.getApplicationLabel(info)?.toString().orEmpty()
        } catch (_: PackageManager.NameNotFoundException) {
            ""
        }
        // Android 11+ 看不到别的包时 getApplicationInfo 会失败；至少留下包名末段，方便区分行。
        val resolved = resolveAppLabel(display, packageName)
        cache[packageName] = resolved
        return resolved
    }

    private fun callRows(
        context: Context,
        start: Long,
        end: Long,
        countryIso: String,
    ): JSONArray {
        val array = JSONArray()
        val projection = arrayOf(
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NORMALIZED_NUMBER,
            CallLog.Calls.TYPE,
        )
        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} <= ?",
            arrayOf(start.toString(), end.toString()),
            "${CallLog.Calls.DATE} ASC",
        ) ?: return array
        cursor.use { rows ->
            val dateIndex = rows.getColumnIndex(CallLog.Calls.DATE)
            val durationIndex = rows.getColumnIndex(CallLog.Calls.DURATION)
            val numberIndex = rows.getColumnIndex(CallLog.Calls.NUMBER)
            val cachedIndex = rows.getColumnIndex(CallLog.Calls.CACHED_NORMALIZED_NUMBER)
            val typeIndex = rows.getColumnIndex(CallLog.Calls.TYPE)
            while (rows.moveToNext()) {
                if (dateIndex < 0 || durationIndex < 0 || typeIndex < 0) continue
                val raw = if (numberIndex >= 0) rows.getString(numberIndex) else null
                val cached = if (cachedIndex >= 0) rows.getString(cachedIndex) else null
                val row = JSONObject()
                row.put("date", rows.getLong(dateIndex))
                row.put("duration", rows.getLong(durationIndex))
                row.put("type", rows.getInt(typeIndex))
                row.put(
                    "e164",
                    CallAllowlist.normalize(raw, cached, countryIso).orEmpty(),
                )
                array.put(row)
            }
        }
        return array
    }
}
