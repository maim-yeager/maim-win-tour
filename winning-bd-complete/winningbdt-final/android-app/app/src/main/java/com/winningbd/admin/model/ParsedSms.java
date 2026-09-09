package com.winningbd.admin.model;

public class ParsedSms {
    public final String providerKey;
    public final double amount;
    public final String trxId;
    public final String messageHash;

    public ParsedSms(String providerKey, double amount, String trxId, String messageHash) {
        this.providerKey = providerKey;
        this.amount = amount;
        this.trxId = trxId;
        this.messageHash = messageHash;
    }
}