package com.winningbd.admin.model;

// Container for model classes - used for backward compatibility
public class Models {
    public static class ParserProvider extends com.winningbd.admin.model.ParserProvider {
        public ParserProvider(String key, java.util.List<String> senders, java.util.List<String> keywords,
                              String trxPattern, String amountPattern, double minAmount, double maxAmount) {
            super(key, senders, keywords, trxPattern, amountPattern, minAmount, maxAmount);
        }
    }

    public static class ParsedSms extends com.winningbd.admin.model.ParsedSms {
        public ParsedSms(String providerKey, double amount, String trxId, String messageHash) {
            super(providerKey, amount, trxId, messageHash);
        }
    }

    public static class SmsTxPayload extends com.winningbd.admin.model.SmsTxPayload {
        public SmsTxPayload(String paymentMethod, String transactionId, double amount, long timestamp, String messageHash) {
            super(paymentMethod, transactionId, amount, timestamp, messageHash);
        }
    }
}