package com.winningbd.admin.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.winningbd.admin.R
import com.winningbd.admin.store.Prefs

/**
 * Foreground "dataSync" service. Keeps the SMS bridge alive and flushes the
 * offline queue periodically. Started on boot, app-open and connectivity
 * changes; the workers catch the Android 12+ background-start restrictions
 * and fall back to inline flushing.
 */
class SmsBridgeService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val flushEveryMs = 300_000L

    private val flushRunnable = object : Runnable {
        override fun run() {
            QueueFlusher.flushAsync(this@SmsBridgeService)
            handler.postDelayed(this, flushEveryMs)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            startForeground(1, buildNotification())
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        QueueFlusher.flushAsync(this)
        handler.removeCallbacks(flushRunnable)
        handler.postDelayed(flushRunnable, flushEveryMs)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(flushRunnable)
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_sms),
                NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
        val prefs = Prefs(this)
        val text = if (prefs.deviceId.isEmpty()) {
            getString(R.string.service_notif_text)
        } else {
            "Device ${prefs.deviceId.take(14)}\u2026 syncing"
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.service_notif_title))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "sms_bridge"

        fun ensureStarted(context: Context) {
            val app = context.applicationContext
            try {
                app.startService(Intent(app, SmsBridgeService::class.java))
            } catch (e: Exception) {
                // Background FGS start may be restricted — inline flush instead.
                QueueFlusher.flushAsync(app)
            }
        }
    }
}