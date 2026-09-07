package com.winningbd.admin.web;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import com.winningbd.admin.store.Prefs;
import com.winningbd.admin.settings.SettingsActivity;

public class AdminWebInterface {
    private final Context context;
    private final Prefs prefs;

    public AdminWebInterface(Context context) {
        this.context = context;
        this.prefs = new Prefs(context);
    }

    @JavascriptInterface
    public String getDeviceId() {
        return prefs.getDeviceId();
    }

    @JavascriptInterface
    public String getDeviceToken() {
        return prefs.getDeviceToken();
    }

    @JavascriptInterface
    public void openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void openSettings() {
        Intent intent = new Intent(context, SettingsActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public void copyToClipboard(String text) {
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
            context.getSystemService(Context.CLIPBOARD_SERVICE);
        android.content.ClipData clip = android.content.ClipData.newPlainText("copied", text);
        clipboard.setPrimaryClip(clip);
    }
}