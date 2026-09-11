package com.winningbd.admin.net

import com.winningbd.admin.model.SmsTxPayload
import com.winningbd.admin.store.Prefs
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal HTTPS client for the device-scoped endpoints. The backend is the
 * single authority — this app only forwards structured SMS data.
 */
object Api {

    data class Response(val code: Int, val json: JSONObject?, val error: String?)

    private fun base(prefs: Prefs): String = prefs.serverUrl.trim().trimEnd('/')

    private fun open(url: String, method: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 15000
        c.readTimeout = 15000
        c.doInput = true
        c.setRequestProperty("Accept", "application/json")
        return c
    }

    fun fetchConfig(prefs: Prefs): Response {
        if (prefs.deviceId.isEmpty() || prefs.deviceToken.isEmpty()) {
            return Response(401, null, "Device not configured")
        }
        return try {
            val c = open(base(prefs) + "/sms-verification/config", "GET")
            c.setRequestProperty("Authorization", "Bearer " + prefs.deviceToken)
            c.setRequestProperty("X-Device-Id", prefs.deviceId)
            read(c)
        } catch (e: Exception) {
            Response(-1, null, e.message)
        }
    }

    fun postTransaction(prefs: Prefs, payload: SmsTxPayload): Response {
        return try {
            val c = open(base(prefs) + "/sms-verification/transactions", "POST")
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Authorization", "Bearer " + prefs.deviceToken)
            c.setRequestProperty("X-Device-Id", prefs.deviceId)
            val body = payload.toJson().toString().toByteArray(Charsets.UTF_8)
            c.outputStream.use { it.write(body) }
            read(c)
        } catch (e: Exception) {
            Response(-1, null, e.message)
        }
    }

    private fun read(c: HttpURLConnection): Response {
        return try {
            val code = c.responseCode
            val text: String = if (code in 200..299) {
                BufferedInputStream(c.inputStream).bufferedReader(Charsets.UTF_8).use { it.readText() }
            } else {
                (c.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }) ?: ""
            }
            val json = try {
                JSONObject(text)
            } catch (e: Exception) {
                null
            }
            val err = if (code in 200..299) null
            else json?.optJSONObject("error")?.optString("message")
                ?: (if (text.isBlank()) null else text)
            Response(code, json, err)
        } catch (e: Exception) {
            Response(-1, null, e.message)
        } finally {
            try {
                c.disconnect()
            } catch (e: Exception) {
            }
        }
    }
}