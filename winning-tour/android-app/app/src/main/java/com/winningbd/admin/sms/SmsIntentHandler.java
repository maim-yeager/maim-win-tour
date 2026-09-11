package com.winningbd.admin.sms;

import android.content.Context;
import com.winningbd.admin.model.SmsTxPayload;
import com.winningbd.admin.net.Api;
import com.winningbd.admin.service.QueueFlusher;
import com.winningbd.admin.store.Prefs;
import com.winningbd.admin.store.SyncQueue;

public class SmsIntentHandler {

    private final Context context;

    public SmsIntentHandler(Context context) {
        this.context = context;
    }

    public void process(String body, String sender, long receivedAt) {
        Prefs prefs = new Prefs(context);
        
        if (prefs.getDeviceId().isEmpty() || prefs.getDeviceToken().isEmpty()) {
            prefs.addLog("Ignored SMS: device not connected");
            return;
        }

        Api.Response cfgResponse = Api.fetchConfig(prefs);
        if (cfgResponse.code == 401 || cfgResponse.code == 403) {
            prefs.setLastStatus("Device not authorized (" + cfgResponse.code + ")");
            prefs.addLog(prefs.getLastStatus());
            return;
        }
        
        JSONObject config = null;
        if (cfgResponse.json != null) {
            config = cfgResponse.json.optJSONObject("config");
        }
        
        if (config != null && config.optBoolean("enabled", true) == false) {
            prefs.addLog("Verification disabled - SMS ignored");
            return;
        }
        
        SmsParser parser = new SmsParser();
        Map<String, ParserProvider> providers = parser.parseProviders(config);
        if (providers.isEmpty()) {
            prefs.addLog("No provider config on server - SMS ignored");
            return;
        }

        ParsedSms parsed = parser.parse(body, sender, receivedAt, providers);
        if (parsed == null) return;

        // Guard against double delivery of the same broadcast
        String dedupeKey = parsed.providerKey + "_" + parsed.trxId;
        String seen = prefs.getLastProcessed(dedupeKey);
        if (seen.equals(String.valueOf(parsed.amount))) return;
        prefs.setLastProcessed(dedupeKey, String.valueOf(parsed.amount));

        SmsTxPayload payload = new SmsTxPayload(
            parsed.providerKey,
            parsed.trxId,
            parsed.amount,
            receivedAt,
            parsed.messageHash
        );

        Api.Response res = Api.postTransaction(prefs, payload);
        if (res.code >= 200 && res.code < 300) {
            String result = "processed";
            if (res.json != null) {
                result = res.json.optString("matchResult", "processed");
            }
            prefs.setLastStatus(result + " " + parsed.providerKey + " " + parsed.amount);
            prefs.addLog(prefs.getLastStatus());
        } else if (res.code == -1 || res.code >= 500) {
            new SyncQueue(prefs).push(payload.toJson());
            prefs.addLog("Queued " + parsed.providerKey + " " + parsed.trxId + " (" + (res.error != null ? res.error : "offline") + ")");
            QueueFlusher.flushAsync(context);
        } else {
            prefs.addLog("Rejected " + res.code + ": " + (res.error != null ? res.error : "") + " " + parsed.trxId);
        }
    }
}