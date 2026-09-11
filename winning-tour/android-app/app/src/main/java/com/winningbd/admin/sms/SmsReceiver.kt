package com.winningbd.admin.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Listens for incoming payment SMS. Anything that looks like a payment
 * (matched against the server-provided provider config) is parsed and sent
 * to the backend. If the backend is unreachable the payload is encrypted
 * into the offline queue instead.
 */
class SmsReceiver : BroadcastReceiver() {

    private val executor: ExecutorService by lazy { Executors.newSingleThreadExecutor() }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages: Array<SmsMessage> = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            ?: return
        if (messages.isEmpty()) return

        val body = StringBuilder()
        var sender = ""
        var latestTs = 0L
        for (m in messages) {
            body.append(m.messageBody ?: "")
            if (sender.isEmpty()) sender = m.originatingAddress ?: ""
            if (m.timestampMillis > latestTs) latestTs = m.timestampMillis
        }
        if (body.isBlank() || sender.isBlank()) return

        val text = body.toString()
        val sndr = sender
        val ts = if (latestTs > 0L) latestTs else System.currentTimeMillis()

        val pending = goAsync()
        executor.execute {
            try {
                SmsIntentHandler(context).process(text, sndr, ts)
            } catch (e: Exception) {
                // never crash the dispatcher
            } finally {
                pending.finish()
            }
        }
    }
}