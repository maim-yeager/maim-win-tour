package com.winningbd.admin.sms

import android.content.Context
import com.winningbd.admin.model.SmsTxPayload
import com.winningbd.admin.net.Api
import com.winningbd.admin.service.QueueFlusher
import com.winningbd.admin.store.Prefs
import com.winningbd.admin.store.SyncQueue

/**
 * One parsed SMS -> one attempt to forward it. The backend decides the
 * outcome; on failure the payload is encrypted and queued for later sync.
 */
class SmsIntentHandler(private val context: Context) {

    fun process(body: String, sender: String, receivedAt: Long) {
        val prefs = Prefs(context)
        if (prefs.deviceId.isEmpty() || prefs.deviceToken.isEmpty()) {
            prefs.addLog("Ignored SMS: device not connected")
            return
        }

        val cfgResponse = Api.fetchConfig(prefs)
        if (cfgResponse.code == 401 || cfgResponse.code == 403) {
            prefs.lastStatus = "Device not authorized (" + cfgResponse.code + ")"
            prefs.addLog(prefs.lastStatus)
            return
        }
        val config = cfgResponse.json?.optJSONObject("config")
        if (config?.optBoolean("enabled", true) == false) {
            prefs.addLog("Verification disabled — SMS ignored")
            return
        }
        val providers = SmsParser().parseProviders(config)
        if (providers.isEmpty()) {
            prefs.addLog("No provider config on server — SMS ignored")
            return
        }

        val parsed = SmsParser().parse(body, sender, receivedAt, providers) ?: return

        // Guard against double delivery of the same broadcast.
        val dedupeKey = parsed.providerKey + "_" + parsed.trxId
        val seen = prefs.lastProcessed(dedupeKey)
        if (seen == parsed.amount.toString()) return
        prefs.setLastProcessed(dedupeKey, parsed.amount.toString())

        val payload = SmsTxPayload(
            paymentMethod = parsed.providerKey,
            transactionId = parsed.trxId,
            amount = parsed.amount,
            timestamp = receivedAt,
            messageHash = parsed.messageHash
        )

        val res = Api.postTransaction(prefs, payload)
        when {
            res.code in 200..299 -> {
                val result = res.json?.optString("matchResult") ?: "processed"
                prefs.lastStatus = "$result ${parsed.providerKey} ${parsed.amount}"
                prefs.addLog(prefs.lastStatus)
            }
            res.code == -1 || res.code >= 500 -> {
                SyncQueue(prefs).push(payload.toJson())
                prefs.addLog("Queued ${parsed.providerKey} ${parsed.trxId} (${res.error ?: "offline"})")
                QueueFlusher.flushAsync(context)
            }
            else -> prefs.addLog("Rejected ${res.code}: ${res.error ?: ""} ${parsed.trxId}")
        }
    }
}