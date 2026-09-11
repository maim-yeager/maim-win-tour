package com.winningbd.admin.settings

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.winningbd.admin.R
import com.winningbd.admin.net.Api
import com.winningbd.admin.service.QueueFlusher
import com.winningbd.admin.service.SmsBridgeService
import com.winningbd.admin.store.Prefs
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class SettingsActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private val exec: ExecutorService = Executors.newSingleThreadExecutor()

    private val smsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            status(if (granted) "SMS permission granted" else "SMS permission denied")
        }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            status(if (granted) "Notifications enabled" else "Notifications disabled")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        prefs = Prefs(this)
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            title = getString(R.string.settings_title)
        }

        findViewById<TextInputEditText>(R.id.et_server).setText(prefs.serverUrl)
        findViewById<TextInputEditText>(R.id.et_device_id).setText(prefs.deviceId)
        findViewById<TextInputEditText>(R.id.et_device_token).setText(prefs.deviceToken)
        findViewById<TextInputEditText>(R.id.et_device_name).setText(prefs.deviceName)

        findViewById<MaterialButton>(R.id.btn_save).setOnClickListener {
            save()
            renderStatus()
            renderLog()
        }
        findViewById<MaterialButton>(R.id.btn_test).setOnClickListener { testConnection() }
        findViewById<MaterialButton>(R.id.btn_sync).setOnClickListener {
            SmsBridgeService.ensureStarted(this)
            QueueFlusher.flushAsync(this)
            status("Sync triggered")
            renderLog()
        }
        findViewById<MaterialButton>(R.id.btn_sms_perm).setOnClickListener { requestSmsPermission() }

        renderStatus()
        renderLog()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun save() {
        prefs.serverUrl = input(R.id.et_server).trim().trimEnd('/')
        prefs.deviceId = input(R.id.et_device_id).trim()
        prefs.deviceToken = input(R.id.et_device_token).trim()
        prefs.deviceName = input(R.id.et_device_name).trim().ifEmpty { Build.MODEL }
        status("Saved")
    }

    private fun input(id: Int): String =
        findViewById<TextInputEditText>(id).text?.toString() ?: ""

    private fun status(s: String) {
        findViewById<TextView>(R.id.tv_status).text = s
    }

    private fun renderStatus() {
        status(prefs.lastStatus.ifEmpty { "Ready. Register the device from the Admin Panel first." })
    }

    private fun renderLog() {
        findViewById<TextView>(R.id.tv_log).text =
            prefs.logLines().joinToString("\n").ifEmpty { getString(R.string.no_activity) }
    }

    private fun testConnection() {
        save()
        status("Testing connection\u2026")
        exec.execute {
            val res = Api.fetchConfig(prefs)
            runOnUiThread {
                var line: String
                if (res.code in 200..299) {
                    val cfg = res.json?.optJSONObject("config")
                    val dev = res.json?.optJSONObject("device")
                    val enabled = cfg?.optBoolean("enabled", true) ?: true
                    val devStatus = dev?.optString("status") ?: "?"
                    line = "Connected (device $devStatus, auto-verification " +
                        (if (enabled) "ON" else "OFF") + ")"
                } else {
                    line = "Connection failed (${res.code}) ${res.error ?: ""}"
                }
                prefs.lastStatus = line
                prefs.addLog(line)
                status(line)
                renderLog()
            }
        }
    }

    private fun requestSmsPermission() {
        val p = Manifest.permission.RECEIVE_SMS
        if (ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED) {
            status("SMS permission already granted")
            return
        }
        smsPermission.launch(p)
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        requestNotificationPermissionIfNeeded()
    }
}