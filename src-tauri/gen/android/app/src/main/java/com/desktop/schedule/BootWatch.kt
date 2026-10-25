package com.desktop.schedule

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.webkit.WebView
import androidx.appcompat.app.AlertDialog

internal const val BOOT_HTML_DEADLINE_MS = 8_000L
internal const val BOOT_READY_DEADLINE_MS = 16_000L
internal const val BOOT_MAX_RELOADS = 2
internal const val BOOT_RESTART_WINDOW_MS = 120_000L

internal enum class BootAction {
    Reload,
    Restart,
    GiveUp,
}

/** 页面还没活过来时该做什么。重载换一条通道，重启换一个进程，然后停。 */
internal fun bootDeadlineAction(reloads: Int, restartedRecently: Boolean): BootAction {
    if (reloads < BOOT_MAX_RELOADS) return BootAction.Reload
    if (!restartedRecently) return BootAction.Restart
    return BootAction.GiveUp
}

/**
 * 文档或界面迟迟不来时，重载 WebView。
 * wry 会在 setWebViewClient 之前 loadUrl，自定义协议超时后也不会自己再请求，
 * JS 里的超时因此根本跑不到。
 */
class BootWatch(private val activity: MainActivity) {
    private val handler = Handler(Looper.getMainLooper())
    private val htmlDeadline = Runnable { onHtmlDeadline() }
    private val readyDeadline = Runnable { onReadyDeadline() }
    private var webView: WebView? = null
    private var startedAt = 0L
    private var started = false
    private var generation = 0
    private var htmlSeen = false
    private var readySeen = false
    private var reloads = 0
    private var dialogShown = false

    fun attach(view: WebView) {
        webView = view
        if (started) return
        started = true
        startedAt = SystemClock.elapsedRealtime()
        log("start")
        handler.postDelayed(htmlDeadline, BOOT_HTML_DEADLINE_MS)
    }

    fun stop() {
        handler.removeCallbacksAndMessages(null)
    }

    fun onHtml() {
        val gen = generation
        handler.post {
            if (gen != generation || htmlSeen) return@post
            htmlSeen = true
            log("html")
            handler.removeCallbacks(htmlDeadline)
            handler.removeCallbacks(readyDeadline)
            handler.postDelayed(readyDeadline, BOOT_READY_DEADLINE_MS)
        }
    }

    fun onReady() {
        val gen = generation
        handler.post {
            if (gen != generation || !htmlSeen || readySeen) return@post
            readySeen = true
            log("ready")
            handler.removeCallbacksAndMessages(null)
        }
    }

    fun onRecover() {
        handler.post {
            log("js-recover")
            act("js-recover")
        }
    }

    fun onRestart() {
        handler.post {
            log("js-restart")
            restartProcess(force = false)
        }
    }

    private fun onHtmlDeadline() {
        if (htmlSeen || readySeen) return
        log("html-deadline")
        act("html-deadline")
    }

    private fun onReadyDeadline() {
        if (readySeen) return
        log("ready-deadline")
        act("ready-deadline")
    }

    private fun act(reason: String) {
        when (bootDeadlineAction(reloads, restartedRecently())) {
            BootAction.Reload -> reload(reason)
            BootAction.Restart -> restartProcess(force = false)
            BootAction.GiveUp -> showGiveUp()
        }
    }

    private fun reload(reason: String) {
        val view = webView ?: return
        reloads += 1
        generation += 1
        htmlSeen = false
        readySeen = false
        dialogShown = false
        handler.removeCallbacksAndMessages(null)
        log("reload $reason count=$reloads")
        view.stopLoading()
        val url = view.url
        if (url.isNullOrBlank() || url == "about:blank") {
            view.loadUrl("http://tauri.localhost/")
        } else {
            view.reload()
        }
        handler.postDelayed(htmlDeadline, BOOT_HTML_DEADLINE_MS)
    }

    private fun restartProcess(force: Boolean) {
        if (restartedRecently() && !force) {
            log("restart-skipped")
            if (!readySeen) showGiveUp()
            return
        }
        val prefs = activity.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        val ok = prefs.edit()
            .putLong(KEY_AT, System.currentTimeMillis())
            .putInt(KEY_COUNT, 1)
            .commit()
        log("restart force=$force prefs=$ok")
        val intent = activity.packageManager.getLaunchIntentForPackage(activity.packageName)
        if (intent != null) {
            intent.addFlags(
                android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                    android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK,
            )
            activity.startActivity(intent)
        }
        activity.finishAffinity()
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    private fun showGiveUp() {
        if (dialogShown || activity.isFinishing) return
        dialogShown = true
        log("give-up")
        AlertDialog.Builder(activity)
            .setTitle("小日程打不开")
            .setMessage("已经自动重试过，页面还是没有出来。可以再试一次，或重新打开。")
            .setPositiveButton("再试一次") { _, _ ->
                dialogShown = false
                reloads = 0
                reload("dialog")
            }
            .setNegativeButton("重新打开") { _, _ ->
                dialogShown = false
                restartProcess(force = true)
            }
            .setCancelable(true)
            .show()
    }

    private fun restartedRecently(): Boolean {
        val prefs = activity.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_AT, 0L)
        return last != 0L && System.currentTimeMillis() - last < BOOT_RESTART_WINDOW_MS
    }

    private fun log(event: String) {
        val elapsed = if (startedAt == 0L) 0 else SystemClock.elapsedRealtime() - startedAt
        Log.i(
            TAG,
            "boot $event +${elapsed}ms reloads=$reloads html=$htmlSeen ready=$readySeen",
        )
    }

    companion object {
        private const val TAG = "ScheduleBoot"
        private const val PREFS = "schedule_boot"
        private const val KEY_AT = "restart_at"
        private const val KEY_COUNT = "restart_count"
    }
}

class BootBridge(private val watch: BootWatch) {
    @android.webkit.JavascriptInterface
    fun html() {
        watch.onHtml()
    }

    @android.webkit.JavascriptInterface
    fun ready() {
        watch.onReady()
    }

    @android.webkit.JavascriptInterface
    fun recover() {
        watch.onRecover()
    }

    @android.webkit.JavascriptInterface
    fun restart() {
        watch.onRestart()
    }
}
