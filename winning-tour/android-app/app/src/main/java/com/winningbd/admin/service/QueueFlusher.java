package com.winningbd.admin.service;

import android.content.Context;
import android.os.AsyncTask;
import com.winningbd.admin.net.Api;
import com.winningbd.admin.store.Prefs;
import com.winningbd.admin.store.SyncQueue;

public class QueueFlusher {

    public static void flushAsync(Context context) {
        new FlushTask(context).executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR);
    }

    private static class FlushTask extends AsyncTask<Void, Void, Void> {
        private final Context context;
        private final Prefs prefs;

        FlushTask(Context context) {
            this.context = context.getApplicationContext();
            this.prefs = new Prefs(this.context);
        }

        @Override
        protected Void doInBackground(Void... voids) {
            SyncQueue queue = new SyncQueue(prefs);
            
            while (queue.size() > 0) {
                JSONObject payload = queue.peek();
                if (payload == null) {
                    queue.pop();
                    continue;
                }
                
                Api.Response res = Api.postTransaction(prefs, new com.winningbd.admin.model.SmsTxPayload(
                    payload.optString("paymentMethod"),
                    payload.optString("transactionId"),
                    payload.optDouble("amount"),
                    payload.optLong("timestamp"),
                    payload.optString("messageHash")
                ));
                
                if (res.code >= 200 && res.code < 300) {
                    queue.pop();
                    prefs.addLog("Synced " + payload.optString("paymentMethod") + " " + payload.optString("transactionId"));
                } else if (res.code == 401 || res.code == 403) {
                    // Device auth failed - stop flushing
                    prefs.addLog("Sync stopped: device auth failed (" + res.code + ")");
                    break;
                } else {
                    // Server error or client error - keep in queue for retry
                    break;
                }
            }
            return null;
        }
    }
}