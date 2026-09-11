package com.winningbd.admin

import android.app.Application
import com.winningbd.admin.service.SmsBridgeService

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        try {
            SmsBridgeService.ensureStarted(this)
        } catch (e: Throwable) {
            // never crash at boot
        }
    }
}