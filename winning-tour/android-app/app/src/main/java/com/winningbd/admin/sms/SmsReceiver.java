package com.winningbd.admin.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.AsyncTask;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SmsReceiver extends BroadcastReceiver {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }
        
        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String sender = "";
        long latestTs = 0;
        
        for (SmsMessage msg : messages) {
            String msgBody = msg.getMessageBody();
            if (msgBody != null) body.append(msgBody);
            if (sender.isEmpty()) {
                String origin = msg.getOriginatingAddress();
                if (origin != null) sender = origin;
            }
            if (msg.getTimestampMillis() > latestTs) {
                latestTs = msg.getTimestampMillis();
            }
        }
        
        if (body.length() == 0 || sender.isEmpty()) return;

        final String text = body.toString();
        final String sndr = sender;
        final long ts = latestTs > 0 ? latestTs : System.currentTimeMillis();

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    new SmsIntentHandler(context).process(text, sndr, ts);
                } catch (Exception e) {
                    // Never crash the dispatcher
                }
            }
        });
    }
}