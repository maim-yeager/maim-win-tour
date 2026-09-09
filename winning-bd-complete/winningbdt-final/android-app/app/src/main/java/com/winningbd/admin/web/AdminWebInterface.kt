package com.winningbd.admin.web

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.JavascriptInterface
import com.winningbd.admin.store.Prefs

/**
 * JS bridge exposed to the admin panel as window.WinAdmin. Pass-through for
 * device credentials so the panel can surface device connection status.
 */
class AdminWebInterface(context: Context) {
    private val prefs = Prefs(context)

    @JavascriptInterface
    @SuppressLint("WebViewJavaScriptInterface")
    fun deviceId(): String = prefs.deviceId

    @JavascriptInterface
    @SuppressLint("WebViewJavaScriptInterface")
    fun deviceToken(): String = prefs.deviceToken

    @JavascriptInterface
    @SuppressLint("WebViewJavaScriptInterface")
    fun serverUrl(): String = prefs.serverUrl

    @JavascriptInterface
    @SuppressLint("WebViewJavaScriptInterface")
    fun appVersion(): String = "1.0.0"

    @JavascriptInterface
    @SuppressLint("WebViewJavaScriptInterface")
    fun lastStatus(): String = prefs.lastStatus
}