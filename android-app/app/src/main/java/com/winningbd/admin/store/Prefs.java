package com.winningbd.admin.store;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class Prefs {
    private final SharedPreferences sp;
    private static final String PREFS_NAME = "winningbd_admin";

    public Prefs(Context context) {
        this.sp = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // Server URL
    public String getServerUrl() {
        return sp.getString("serverUrl", "https://winning-tour-web.vercel.app");
    }

    public void setServerUrl(String url) {
        sp.edit().putString("serverUrl", url).apply();
    }

    // Device ID
    public String getDeviceId() {
        return sp.getString("deviceId", "");
    }

    public void setDeviceId(String deviceId) {
        sp.edit().putString("deviceId", deviceId).apply();
    }

    // Device Token
    public String getDeviceToken() {
        return sp.getString("deviceToken", "");
    }

    public void setDeviceToken(String token) {
        sp.edit().putString("deviceToken", token).apply();
    }

    // Device Name
    public String getDeviceName() {
        return sp.getString("deviceName", android.os.Build.MODEL);
    }

    public void setDeviceName(String name) {
        sp.edit().putString("deviceName", name).apply();
    }

    // Last Status
    public String getLastStatus() {
        return sp.getString("lastStatus", "");
    }

    public void setLastStatus(String status) {
        sp.edit().putString("lastStatus", status).apply();
    }

    // -------- encrypted sync queue ----------
    public String getRawQueue() {
        return sp.getString("queue", "[]");
    }

    public void saveQueue(JSONArray arr) {
        sp.edit().putString("queue", arr.toString()).apply();
    }

    // -------- per-provider dedupe ----------
    public String getLastProcessed(String key) {
        return sp.getString("proc_" + key, "");
    }

    public void setLastProcessed(String key, String value) {
        sp.edit().putString("proc_" + key, value).apply();
    }

    // -------- rolling activity log ----------
    public List<String> getLogLines() {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(sp.getString("log", "[]"));
            for (int i = 0; i < a.length(); i++) {
                out.add(a.optString(i));
            }
        } catch (JSONException ignored) {}
        return out;
    }

    public void addLog(String line) {
        try {
            JSONArray a = new JSONArray(sp.getString("log", "[]"));
            JSONArray b = new JSONArray();
            b.put("[" + ts() + "] " + line);
            for (int i = 0; i < a.length(); i++) {
                if (i >= 59) break;
                b.put(a.optString(i));
            }
            sp.edit().putString("log", b.toString()).apply();
        } catch (JSONException ignored) {}
    }

    public void clearLog() {
        sp.edit().remove("log").apply();
    }

    private String ts() {
        return new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(new Date());
    }
}