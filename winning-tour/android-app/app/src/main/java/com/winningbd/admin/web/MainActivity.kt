package com.winningbd.admin.web

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import com.winningbd.admin.R
import com.winningbd.admin.service.QueueFlusher
import com.winningbd.admin.service.SmsBridgeService
import com.winningbd.admin.settings.SettingsActivity
import com.winningbd.admin.store.Prefs

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val prefs by lazy { Prefs(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setSupportActionBar(findViewById(R.id.toolbar))

        webView = findViewById(R.id.webView)
        setupWebView()
        SmsBridgeService.ensureStarted(this)
        QueueFlusher.flushAsync(this)

        val url = prefs.serverUrl.trim().trimEnd('/') + "/admin/"
        webView.loadUrl(url)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val s: WebSettings = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.userAgentString = (s.userAgentString ?: "") + " WinningBDAdmin/1.0"
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                val host = url.host ?: return false
                val expected = Uri.parse(prefs.serverUrl).host ?: return false
                if (host == expected && (url.scheme == "https" || url.scheme == "http")) {
                    return false
                }
                if (url.scheme == "https" || url.scheme == "http") {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                return false
            }
        }

        webView.addJavascriptInterface(AdminWebInterface(this), "WinAdmin")
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_sync -> {
                QueueFlusher.flushAsync(this)
                true
            }
            R.id.action_reload -> {
                webView.reload()
                true
            }
            R.id.action_settings -> {
                startActivity(Intent(this, SettingsActivity::class.java))
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}