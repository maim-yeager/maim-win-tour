package com.winningbd.admin.service;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import com.winningbd.admin.store.Prefs;
import com.winningbd.admin.store.SyncQueue;

public class NetworkReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        
        if (ConnectivityManager.CONNECTIVITY_ACTION.equals(intent.getAction())) {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            boolean isConnected = activeNetwork != null && activeNetwork.isConnectedOrConnecting();
            
            Prefs prefs = new Prefs(context);
            if (isConnected) {
                prefs.addLog("Network connected - flushing queue");
                QueueFlusher.flushAsync(context);
            } else {
                prefs.addLog("Network disconnected");
            }
        }
    }
}