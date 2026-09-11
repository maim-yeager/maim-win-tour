package com.winningbd.admin.model

import org.json.JSONObject

data class ParserProvider(
    val key: String,
    val senders: List<String>,
    val keywords: List<String>,
    val trxPattern: String?,
    val amountPattern: String?,
    val minAmount: Double,
    val maxAmount: Double
)

data class ParsedSms(
    val providerKey: String,
    val amount: Double,
    val trxId: String,
    val messageHash: String
)

data class SmsTxPayload(
    val paymentMethod: String,
    val transactionId: String,
    val amount: Double,
    val timestamp: Long,
    val messageHash: String
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("paymentMethod", paymentMethod)
        put("transactionId", transactionId)
        put("amount", amount)
        put("timestamp", timestamp)
        put("messageHash", messageHash)
    }

    companion object {
        fun fromJson(o: JSONObject): SmsTxPayload = SmsTxPayload(
            paymentMethod = o.optString("paymentMethod"),
            transactionId = o.optString("transactionId"),
            amount = o.optDouble("amount", 0.0),
            timestamp = o.optLong("timestamp", 0L),
            messageHash = o.optString("messageHash")
        )
    }
}