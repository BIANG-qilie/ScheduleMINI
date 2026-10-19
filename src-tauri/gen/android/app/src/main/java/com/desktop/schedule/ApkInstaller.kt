package com.desktop.schedule

import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/** 网页端通过 window.SmInstaller 调用：下载 APK 并交给系统安装器 */
class ApkInstaller(private val activity: Activity, private val webView: WebView) {
  @JavascriptInterface
  fun canInstall(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      activity.packageManager.canRequestPackageInstalls()

  @JavascriptInterface
  fun openInstallSettings() {
    activity.startActivity(
      Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${activity.packageName}"),
      ),
    )
  }

  @JavascriptInterface
  fun download(url: String, fileName: String) {
    val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
    val file = File(dir, fileName)
    file.delete()
    val manager = activity.getSystemService(DownloadManager::class.java)
    val id = manager.enqueue(
      DownloadManager.Request(Uri.parse(url))
        .setTitle("小日程更新")
        .setMimeType(APK_MIME)
        .setDestinationUri(Uri.fromFile(file))
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE),
    )
    ContextCompat.registerReceiver(
      activity,
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return
          activity.unregisterReceiver(this)
          if (succeeded(manager, id)) install(file) else emit("failed")
        }
      },
      IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
      ContextCompat.RECEIVER_EXPORTED,
    )
  }

  private fun succeeded(manager: DownloadManager, id: Long): Boolean =
    manager.query(DownloadManager.Query().setFilterById(id)).use { c ->
      c.moveToFirst() &&
        c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) ==
        DownloadManager.STATUS_SUCCESSFUL
    }

  private fun install(file: File) {
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
    activity.startActivity(
      Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, APK_MIME)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
    )
    emit("installer")
  }

  private fun emit(state: String) {
    activity.runOnUiThread {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('sm-apk',{detail:'$state'}))",
        null,
      )
    }
  }

  companion object {
    const val APK_MIME = "application/vnd.android.package-archive"
  }
}
