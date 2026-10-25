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
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/** 网页端通过 window.SmInstaller 调用：下载 APK 并交给系统安装器 */
class ApkInstaller(private val activity: Activity, private val webView: WebView) {
  private val progressHandler = Handler(Looper.getMainLooper())
  private var progressPoll: Runnable? = null
  private var lastProgress: String? = null

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
    enqueue(url, fileName, "")
  }

  /** 下载完成后核对 sha256。不一致就删掉文件，不交给系统安装器。 */
  @JavascriptInterface
  fun downloadChecked(url: String, fileName: String, sha256: String) {
    enqueue(url, fileName, sha256)
  }

  private fun enqueue(url: String, fileName: String, sha256: String) {
    val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)!!
    val file = File(dir, fileName)
    file.delete()
    val manager = activity.getSystemService(DownloadManager::class.java)
    lastProgress = null
    val id = manager.enqueue(
      DownloadManager.Request(Uri.parse(url))
        .setTitle("小日程更新")
        .setMimeType(APK_MIME)
        .setDestinationUri(Uri.fromFile(file))
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE),
    )
    watchProgress(manager, id)
    ContextCompat.registerReceiver(
      activity,
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return
          activity.unregisterReceiver(this)
          stopProgress()
          if (!succeeded(manager, id)) {
            emit("failed")
            return
          }
          if (sha256.isBlank()) {
            install(file)
            return
          }
          Thread {
            val ok = try {
              ApkDigest.matches(file, sha256)
            } catch (_: Exception) {
              false
            }
            if (!ok) file.delete()
            if (ok) activity.runOnUiThread { install(file) } else emit("hash-mismatch")
          }.start()
        }
      },
      IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
      ContextCompat.RECEIVER_EXPORTED,
    )
  }

  /** DownloadManager 有总字节数时上报 0–100；总大小未知则上报 null，不编造百分比。 */
  private fun watchProgress(manager: DownloadManager, id: Long) {
    stopProgress()
    val task = object : Runnable {
      override fun run() {
        if (activity.isDestroyed) {
          stopProgress()
          return
        }
        when (val sample = sample(manager, id)) {
          is ProgressSample.Running -> {
            emitProgress(sample.percent)
            progressHandler.postDelayed(this, POLL_MS)
          }
          ProgressSample.Pending -> progressHandler.postDelayed(this, POLL_MS)
          ProgressSample.Complete -> {
            emitProgress(100)
            stopProgress()
          }
          ProgressSample.Stop -> stopProgress()
        }
      }
    }
    progressPoll = task
    progressHandler.post(task)
  }

  private fun stopProgress() {
    progressPoll?.let { progressHandler.removeCallbacks(it) }
    progressPoll = null
  }

  private fun sample(manager: DownloadManager, id: Long): ProgressSample {
    manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
      if (!cursor.moveToFirst()) return ProgressSample.Pending
      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      if (status == DownloadManager.STATUS_SUCCESSFUL) return ProgressSample.Complete
      if (status == DownloadManager.STATUS_FAILED) return ProgressSample.Stop
      val soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
      val percent = if (total > 0) ((soFar * 100) / total).toInt().coerceIn(0, 100) else null
      return ProgressSample.Running(percent)
    }
  }

  private fun emitProgress(percent: Int?) {
    val token = percent?.toString() ?: "indeterminate"
    if (token == lastProgress) return
    lastProgress = token
    emitRaw("{kind:'progress',percent:${percent?.toString() ?: "null"}}")
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
    lastProgress = null
    emitRaw("{kind:'$state'}")
  }

  private fun emitRaw(detailJs: String) {
    activity.runOnUiThread {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('sm-apk',{detail:$detailJs}))",
        null,
      )
    }
  }

  private sealed class ProgressSample {
    data class Running(val percent: Int?) : ProgressSample()
    data object Pending : ProgressSample()
    data object Complete : ProgressSample()
    data object Stop : ProgressSample()
  }

  companion object {
    const val APK_MIME = "application/vnd.android.package-archive"
    private const val POLL_MS = 400L
  }
}
