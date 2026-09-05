package com.winningbd.admin.store

import com.winningbd.admin.sec.Crypto
import org.json.JSONArray
import org.json.JSONObject

/**
 * FIFO of pending transactions, encrypted at rest (AES-GCM via Keystore).
 * Holds up to 300 entries so the device can always carry a reasonable
 * back-log even when offline for days.
 */
class SyncQueue(private val prefs: Prefs) {

    fun size(): Int = raw().length()

    fun push(payload: JSONObject) {
        val cur = raw()
        while (cur.length() >= 300) cur.remove(0)
        val enc = Crypto.encrypt(payload.toString().toByteArray(Charsets.UTF_8))
        cur.put(enc)
        prefs.saveQueue(cur)
    }

    fun peek(): JSONObject? {
        val cur = raw()
        if (cur.length() == 0) return null
        return decrypt(cur.optString(0))
    }

    fun pop(): Boolean {
        val cur = raw()
        if (cur.length() == 0) return false
        val next = JSONArray()
        for (i in 1 until cur.length()) next.put(cur.optString(i))
        prefs.saveQueue(next)
        return true
    }

    fun clear() {
        prefs.saveQueue(JSONArray())
    }

    private fun raw(): JSONArray {
        val s = prefs.rawQueue()
        return try {
            JSONArray(s)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    private fun decrypt(enc: String): JSONObject? {
        val bytes = Crypto.decrypt(enc) ?: return null
        return try {
            JSONObject(String(bytes, Charsets.UTF_8))
        } catch (e: Exception) {
            null
        }
    }
}