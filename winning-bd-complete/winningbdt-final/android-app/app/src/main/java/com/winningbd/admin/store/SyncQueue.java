package com.winningbd.admin.store;

import com.winningbd.admin.sec.Crypto;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

public class SyncQueue {
    private final Prefs prefs;

    public SyncQueue(Prefs prefs) {
        this.prefs = prefs;
    }

    public int size() {
        return raw().length();
    }

    public void push(JSONObject payload) {
        JSONArray cur = raw();
        while (cur.length() >= 300) {
            try {
                cur.remove(0);
            } catch (JSONException ignored) {}
        }
        String enc = Crypto.encrypt(payload.toString().getBytes(StandardCharsets.UTF_8));
        cur.put(enc);
        prefs.saveQueue(cur);
    }

    public JSONObject peek() {
        JSONArray cur = raw();
        if (cur.length() == 0) return null;
        return decrypt(cur.optString(0));
    }

    public boolean pop() {
        JSONArray cur = raw();
        if (cur.length() == 0) return false;
        JSONArray next = new JSONArray();
        try {
            for (int i = 1; i < cur.length(); i++) {
                next.put(cur.optString(i));
            }
        } catch (JSONException ignored) {}
        prefs.saveQueue(next);
        return true;
    }

    public void clear() {
        prefs.saveQueue(new JSONArray());
    }

    private JSONArray raw() {
        try {
            return new JSONArray(prefs.getRawQueue());
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private JSONObject decrypt(String enc) {
        byte[] bytes = Crypto.decrypt(enc);
        if (bytes == null) return null;
        try {
            return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (JSONException e) {
            return null;
        }
    }
}