package com.winningbd.admin.net;

import com.winningbd.admin.model.SmsTxPayload;
import com.winningbd.admin.store.Prefs;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class Api {

    public static class Response {
        public final int code;
        public final JSONObject json;
        public final String error;

        public Response(int code, JSONObject json, String error) {
            this.code = code;
            this.json = json;
            this.error = error;
        }
    }

    private static String base(Prefs prefs) {
        return prefs.getServerUrl().trim().replaceAll("/+$", "");
    }

    private static HttpURLConnection open(String urlString, String method) throws Exception {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setDoInput(true);
        conn.setRequestProperty("Accept", "application/json");
        return conn;
    }

    public static Response fetchConfig(Prefs prefs) {
        if (prefs.getDeviceId().isEmpty() || prefs.getDeviceToken().isEmpty()) {
            return new Response(401, null, "Device not configured");
        }
        try {
            HttpURLConnection conn = open(base(prefs) + "/sms-verification/config", "GET");
            conn.setRequestProperty("Authorization", "Bearer " + prefs.getDeviceToken());
            conn.setRequestProperty("X-Device-Id", prefs.getDeviceId());
            return read(conn);
        } catch (Exception e) {
            return new Response(-1, null, e.getMessage());
        }
    }

    public static Response postTransaction(Prefs prefs, SmsTxPayload payload) {
        try {
            HttpURLConnection conn = open(base(prefs) + "/sms-verification/transactions", "POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + prefs.getDeviceToken());
            conn.setRequestProperty("X-Device-Id", prefs.getDeviceId());
            
            byte[] body = payload.toJson().toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }
            return read(conn);
        } catch (Exception e) {
            return new Response(-1, null, e.getMessage());
        }
    }

    private static Response read(HttpURLConnection conn) {
        try {
            int code = conn.getResponseCode();
            String text;
            if (code >= 200 && code < 300) {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(new BufferedInputStream(conn.getInputStream()), StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line);
                    }
                    text = sb.toString();
                }
            } else {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line);
                    }
                    text = sb.toString();
                } catch (Exception e) {
                    text = "";
                }
            }
            
            JSONObject json = null;
            String err = null;
            if (!text.isEmpty()) {
                try {
                    json = new JSONObject(text);
                } catch (Exception ignored) {}
            }
            if (code < 200 || code >= 300) {
                if (json != null) {
                    err = json.optJSONObject("error").optString("message", text);
                } else {
                    err = text;
                }
            }
            return new Response(code, json, err);
        } catch (Exception e) {
            return new Response(-1, null, e.getMessage());
        } finally {
            try {
                conn.disconnect();
            } catch (Exception ignored) {}
        }
    }
}