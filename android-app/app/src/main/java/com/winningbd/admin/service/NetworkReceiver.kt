package com.winningbd.admin.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NetworkReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "android.net.conn.CONNECTIVITY_CHANGE") {
            // Never start the FGS from here (restricted on Android 12+);
            // inline flush drains anything queued while offline.
            QueueFlusher.flushAsync(context)
        }
    }
}