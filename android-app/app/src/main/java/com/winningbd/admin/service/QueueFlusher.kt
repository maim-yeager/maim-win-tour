package com.winningbd.admin.service

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.winningbd.admin.model.SmsTxPayload
import com.winningbd.admin.net.Api
import com.winningbd.admin.store.Prefs
import com.winningbd.admin.store.SyncQueue
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Flushes the encrypted offline queue to the backend. Used both by the
 * foreground service and directly by receivers, so the queue drains even
 * when the service cannot be started in the background.
 */
object QueueFlusher {

    private val exec: ExecutorService = Executors.newSingleThreadExecutor()

    fun flushAsync(context: Context) {
        exec.execute { flush(context) }
    }

    fun flush(context: Context) {
        val prefs = Prefs(context)
        if (prefs.deviceId.isEmpty() || prefs.deviceToken.isEmpty()) return
        if (!hasNetwork(context)) return
        val queue = SyncQueue(prefs)
        if (queue.size() == 0) return

        var attempts = 0
        while (queue.size() > 0 && attempts < 10) {
            attempts++
            val payload = queue.peek()
            if (payload == null) {
                // Undecryptable/corrupt front entry — drop it so the queue can drain.
                queue.pop()
                prefs.addLog("Dropped corrupt queued entry")
                continue
            }
            val res = Api.postTransaction(prefs, SmsTxPayload.fromJson(payload))
            when {
                res.code in 200..299 -> {
                    queue.pop()
                    prefs.lastStatus = "Synced ${res.json?.optString("matchResult") ?: "ok"}"
                }
                res.code == -1 || res.code >= 500 -> break // keep the queue, retry later
                else -> {
                    queue.pop() // permanent rejection — drop after logging
                    prefs.addLog("Dropped queued tx (${res.code}): ${res.error ?: ""}")
                }
            }
        }
    }

    private fun hasNetwork(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}