package com.winningbd.admin.sms

import com.winningbd.admin.model.ParserProvider
import com.winningbd.admin.model.ParsedSms
import com.winningbd.admin.sec.Crypto
import org.json.JSONObject

/**
 * Parses payment SMS into a structured payload the backend can verify.
 * Pure string work — no financial decision is made here.
 */
class SmsParser {

    companion object {
        private const val TAG = "SmsParser"
    }

    fun parseProviders(config: JSONObject?): Map<String, ParserProvider> {
        val out = LinkedHashMap<String, ParserProvider>()
        val providers = config?.optJSONObject("providers") ?: return out
        val it = providers.keys()
        while (it.hasNext()) {
            val key = it.next().lowercase()
            val p = providers.optJSONObject(key) ?: continue
            val senders = strArray(p, "senders").ifEmpty { listOf(key) }
            val keywords = strArray(p, "keywords")
            val trxPattern = p.optString("trxPattern").takeIf { it.isNotBlank() }
            val amountPattern = p.optString("amountPattern").takeIf { it.isNotBlank() }
            val minAmount = p.optDouble("minAmount", 1.0).let { if (it > 0) it else 1.0 }
            val maxAmount = p.optDouble("maxAmount", 1000000.0).let { if (it > 0) it else 1000000.0 }
            out[key] = ParserProvider(key, senders, keywords, trxPattern, amountPattern, minAmount, maxAmount)
        }
        return out
    }

    fun parse(body: String, sender: String, receivedAt: Long, providers: Map<String, ParserProvider>): ParsedSms? {
        if (body.isBlank() || sender.isBlank()) return null
        val lower = body.lowercase()
        for ((key, p) in providers) {
            val senderHit = p.senders.any { s ->
                val sLow = s.lowercase()
                sender.lowercase().contains(sLow) || sLow.contains(sender.lowercase())
            }
            if (!senderHit) continue
            if (p.keywords.isNotEmpty() && !p.keywords.any { lower.contains(it.lowercase()) }) continue
            val amount = extractAmount(body, p) ?: continue
            val trx = extractTrx(body, p) ?: continue
            if (trx.length < 4 || trx.length > 64) continue
            val msgHash = Crypto.sha256("$sender|$key|$trx|$amount")
            return ParsedSms(key, amount, trx, msgHash)
        }
        return null
    }

    private fun strArray(o: JSONObject, name: String): List<String> {
        val a = o.optJSONArray(name) ?: return emptyList()
        val out = ArrayList<String>()
        for (i in 0 until a.length()) {
            val v = a.optString(i)
            if (v.isNotBlank()) out.add(v)
        }
        return out
    }

    private fun extractTrx(body: String, p: ParserProvider): String? {
        val labeled =
            Regex("(?i)(?:trx[\\. ]?id|ref(?:erence)?)[:=\\s-]*([A-Z0-9._:\\-]{4,64})")
        labeled.find(body)?.let { m -> return m.groupValues[1].uppercase() }

        p.trxPattern?.let { pat ->
            runCatching { Regex(pat, RegexOption.IGNORE_CASE) }.getOrNull()?.find(body)?.let { m ->
                val g = if (m.groupValues.size > 1) m.groupValues[1] else m.value
                return normalizeTrx(g)
            }
        }

        Regex("[A-Z0-9._:\\-]{6,}", RegexOption.IGNORE_CASE).find(body)?.let { m ->
            return normalizeTrx(m.value)
        }
        return null
    }

    private fun extractAmount(body: String, p: ParserProvider): Double? {
        val bounds = p.minAmount..p.maxAmount

        // 1) Explicit per-provider pattern (most reliable when configured).
        p.amountPattern?.let { pat ->
            runCatching { Regex(pat) }.getOrNull()?.find(body)?.let { m ->
                val raw = if (m.groupValues.size > 1) m.groupValues[1] else m.value
                return parseMoney(raw)?.takeIf { it in bounds }
            }
        }

        // 2) Amount next to a currency label ("BDT", "Tk", "Taka", "/=").
        val labeled = Regex("(\\d{1,10}(?:\\.\\d{1,2})?)\\s*(?:bdt|taka|tk\\.?|/=)", RegexOption.IGNORE_CASE)
        val labeledHits = labeled.findAll(body)
            .mapNotNull { parseMoney(it.groupValues[1]) }
            .filter { it in bounds }
            .toList()
        if (labeledHits.isNotEmpty()) return labeledHits.first()

        // 3) Fallback: scan bare numbers inside provider bounds.
        val candidates = Regex("\\d{1,10}(?:\\.\\d{1,2})?")
            .findAll(body)
            .mapNotNull { parseMoney(it.value) }
            .filter { it in bounds }
            .toList()
        if (candidates.size == 1) return candidates[0]
        val withDecimals = candidates.filter { it % 1.0 != 0.0 }
        if (withDecimals.size == 1) return withDecimals[0]
        return if (candidates.isEmpty()) null else candidates.maxOrNull()
    }

    private fun parseMoney(s: String?): Double? {
        if (s.isNullOrBlank()) return null
        val v = s.replace(",", "").toDoubleOrNull() ?: return null
        return Math.round(v * 100.0) / 100.0
    }

    private fun normalizeTrx(s: String): String = s.trim().trim('.').uppercase()
}