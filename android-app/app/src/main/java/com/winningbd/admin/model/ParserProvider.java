package com.winningbd.admin.model;

import java.util.List;

public class ParserProvider {
    public final String key;
    public final List<String> senders;
    public final List<String> keywords;
    public final String trxPattern;
    public final String amountPattern;
    public final double minAmount;
    public final double maxAmount;

    public ParserProvider(String key, List<String> senders, List<String> keywords,
                          String trxPattern, String amountPattern, double minAmount, double maxAmount) {
        this.key = key;
        this.senders = senders;
        this.keywords = keywords;
        this.trxPattern = trxPattern;
        this.amountPattern = amountPattern;
        this.minAmount = minAmount;
        this.maxAmount = maxAmount;
    }
}