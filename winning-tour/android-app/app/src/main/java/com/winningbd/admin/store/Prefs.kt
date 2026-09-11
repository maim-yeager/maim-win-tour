package com.winningbd.admin.store

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("winningbd_admin", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "https://winning-tour-web.vercel.app")
            ?: "https://winning-tour-web.vercel.app"
        set(v) {
            sp.edit().putString("serverUrl", v).apply()
        }

    var deviceId: String
        get() = sp.getString("deviceId", "") ?: ""
        set(v) {
            sp.edit().putString("deviceId", v).apply()
        }

    var deviceToken: String
        get() = sp.getString("deviceToken", "") ?: ""
        set(v) {
            sp.edit().putString("deviceToken", v).apply()
        }

    var deviceName: String
        get() = sp.getString("deviceName", android.os.Build.MODEL) ?: android.os.Build.MODEL
        set(v) {
            sp.edit().putString("deviceName", v).apply()
        }

    var lastStatus: String
        get() = sp.getString("lastStatus", "") ?: ""
        set(v) {
            sp.edit().putString("lastStatus", v).apply()
        }

    // -------- encrypted sync queue ----------
    fun rawQueue(): String = sp.getString("queue", "[]") ?: "[]"

    fun saveQueue(arr: JSONArray) {
        sp.edit().putString("queue", arr.toString()).apply()
    }

    // -------- per-provider dedupe ----------
    fun lastProcessed(key: String): String = sp.getString("proc_$key", "") ?: ""

    fun setLastProcessed(key: String, value: String) {
        sp.edit().putString("proc_$key", value).apply()
    }

    // -------- rolling activity log ----------
    fun logLines(): List<String> {
        val a = logArray()
        val out = ArrayList<String>()
        for (i in 0 until a.length()) out.add(a.optString(i))
        return out
    }

    fun addLog(line: String) {
        val a = logArray()
        val b = JSONArray()
        b.put("[" + ts() + "] " + line)
        for (i in 0 until a.length()) {
            if (i >= 59) break
            b.put(a.optString(i))
        }
        sp.edit().putString("log", b.toString()).apply()
    }

    fun clearLog() {
        sp.edit().remove("log").apply()
    }

    private fun logArray(): JSONArray {
        val s = sp.getString("log", "") ?: ""
        return try {
            JSONArray(s)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    private fun ts(): String =
        SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(Date())
}