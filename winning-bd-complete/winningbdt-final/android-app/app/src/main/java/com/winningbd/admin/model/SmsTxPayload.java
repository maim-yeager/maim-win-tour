package com.winningbd.admin.model;

import org.json.JSONException;
import org.json.JSONObject;

public class SmsTxPayload {
    public final String paymentMethod;
    public final String transactionId;
    public final double amount;
    public final long timestamp;
    public final String messageHash;

    public SmsTxPayload(String paymentMethod, String transactionId, double amount, long timestamp, String messageHash) {
        this.paymentMethod = paymentMethod;
        this.transactionId = transactionId;
        this.amount = amount;
        this.timestamp = timestamp;
        this.messageHash = messageHash;
    }

    public JSONObject toJson() {
        JSONObject obj = new JSONObject();
        try {
            obj.put("paymentMethod", paymentMethod);
            obj.put("transactionId", transactionId);
            obj.put("amount", amount);
            obj.put("timestamp", timestamp);
            obj.put("messageHash", messageHash);
        } catch (JSONException e) {
            // Should not happen
        }
        return obj;
    }
}