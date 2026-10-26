package com.desktop.schedule

import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import com.desktop.schedule.widget.WidgetUpdater

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var openNow = false
  private val bootWatch = BootWatch(this)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onDestroy() {
    bootWatch.stop()
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    dispatchOpenNow()
  }

  override fun onResume() {
    super.onResume()
    dispatchOpenNow()
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(ApkInstaller(this, webView), "SmInstaller")
    webView.addJavascriptInterface(WidgetBridge(this), "SmWidget")
    webView.addJavascriptInterface(BootBridge(bootWatch), "SmBoot")
    webView.addJavascriptInterface(DayReplayBridge(this), "SmDayReplay")
    bootWatch.attach(webView)
    dispatchOpenNow()
  }

  fun consumeOpenNow(): Boolean {
    val open = openNow
    openNow = false
    return open
  }

  private fun dispatchOpenNow() {
    val current = intent
    if (current?.getBooleanExtra(WidgetUpdater.EXTRA_OPEN_NOW, false) == true) {
      current.removeExtra(WidgetUpdater.EXTRA_OPEN_NOW)
      openNow = true
    }
    if (!openNow) return
    webView?.evaluateJavascript(
      "if(window.__scheduleOpenNow&&window.SmWidget&&window.SmWidget.consumeOpenNow&&window.SmWidget.consumeOpenNow()){window.__scheduleOpenNow();}",
      null,
    )
  }
}

class WidgetBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun notifyScheduleChanged() {
    WidgetUpdater.requestUpdate(activity.applicationContext)
  }

  @JavascriptInterface
  fun consumeOpenNow(): Boolean = activity.consumeOpenNow()
}
