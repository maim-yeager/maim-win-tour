package com.winningbd.admin.sms;

import com.winningbd.admin.model.ParserProvider;
import com.winningbd.admin.model.ParsedSms;
import com.winningbd.admin.sec.Crypto;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmsParser {

    public Map<String, ParserProvider> parseProviders(JSONObject config) {
        Map<String, ParserProvider> out = new LinkedHashMap<>();
        if (config == null) return out;
        JSONObject providers = config.optJSONObject("providers");
        if (providers == null) return out;
        
        for (String key : providers.keySet()) {
            String k = key.toLowerCase();
            JSONObject p = providers.optJSONObject(key);
            if (p == null) continue;
            
            List<String> senders = strArray(p, "senders");
            if (senders.isEmpty()) {
                senders.add(k);
            }
            List<String> keywords = strArray(p, "keywords");
            String trxPattern = p.optString("trxPattern", "");
            if (trxPattern.isEmpty()) trxPattern = null;
            String amountPattern = p.optString("amountPattern", "");
            if (amountPattern.isEmpty()) amountPattern = null;
            double minAmount = p.optDouble("minAmount", 1.0);
            if (minAmount <= 0) minAmount = 1.0;
            double maxAmount = p.optDouble("maxAmount", 1000000.0);
            if (maxAmount <= 0) maxAmount = 1000000.0;
            
            out.put(k, new ParserProvider(k, senders, keywords, trxPattern, amountPattern, minAmount, maxAmount));
        }
        return out;
    }

    private List<String> strArray(JSONObject o, String name) {
        List<String> out = new ArrayList<>();
        JSONArray a = o.optJSONArray(name);
        if (a == null) return out;
        for (int i = 0; i < a.length(); i++) {
            String v = a.optString(i);
            if (v != null && !v.trim().isEmpty()) {
                out.add(v);
            }
        }
        return out;
    }

    public ParsedSms parse(String body, String sender, long receivedAt, Map<String, ParserProvider> providers) {
        if (body == null || body.trim().isEmpty() || sender == null || sender.trim().isEmpty()) {
            return null;
        }
        String lower = body.toLowerCase();
        for (Map.Entry<String, ParserProvider> entry : providers.entrySet()) {
            String key = entry.getKey();
            ParserProvider p = entry.getValue();
            
            boolean senderHit = false;
            for (String s : p.senders) {
                String sLow = s.toLowerCase();
                if (sender.toLowerCase().contains(sLow) || sLow.contains(sender.toLowerCase())) {
                    senderHit = true;
                    break;
                }
            }
            if (!senderHit) continue;
            
            if (!p.keywords.isEmpty()) {
                boolean keywordHit = false;
                for (String kw : p.keywords) {
                    if (lower.contains(kw.toLowerCase())) {
                        keywordHit = true;
                        break;
                    }
                }
                if (!keywordHit) continue;
            }
            
            Double amount = extractAmount(body, p);
            if (amount == null) continue;
            
            String trx = extractTrx(body, p);
            if (trx == null || trx.length() < 4 || trx.length() > 64) continue;
            
            String msgHash = Crypto.sha256(sender + "|" + key + "|" + trx + "|" + amount);
            return new ParsedSms(key, amount, trx, msgHash);
        }
        return null;
    }

    private String extractTrx(String body, ParserProvider p) {
        // 1) Labeled patterns (TrxID, Ref, Reference)
        Pattern labeled = Pattern.compile("(?i)(?:trx[\\. ]?id|ref(?:erence)?)[:=\\s-]*([A-Z0-9._:\\-]{4,64})");
        Matcher m = labeled.matcher(body);
        if (m.find()) {
            return normalizeTrx(m.group(1));
        }

        // 2) Provider-specific pattern
        if (p.trxPattern != null) {
            try {
                Pattern pat = Pattern.compile(p.trxPattern, Pattern.CASE_INSENSITIVE);
                m = pat.matcher(body);
                if (m.find()) {
                    String g = m.groupCount() > 1 ? m.group(1) : m.group();
                    return normalizeTrx(g);
                }
            } catch (Exception ignored) {}
        }

        // 3) Fallback: any alphanumeric string 6+ chars
        Pattern fallback = Pattern.compile("[A-Z0-9._:\\-]{6,}", Pattern.CASE_INSENSITIVE);
        m = fallback.matcher(body);
        if (m.find()) {
            return normalizeTrx(m.group());
        }
        return null;
    }

    private Double extractAmount(String body, ParserProvider p) {
        double minAmount = p.minAmount;
        double maxAmount = p.maxAmount;

        // 1) Explicit per-provider pattern
        if (p.amountPattern != null) {
            try {
                Pattern pat = Pattern.compile(p.amountPattern);
                Matcher m = pat.matcher(body);
                if (m.find()) {
                    String raw = m.groupCount() > 1 ? m.group(1) : m.group();
                    Double parsed = parseMoney(raw);
                    if (parsed != null && parsed >= minAmount && parsed <= maxAmount) {
                        return parsed;
                    }
                }
            } catch (Exception ignored) {}
        }

        // 2) Amount next to currency label
        Pattern labeled = Pattern.compile("(\\d{1,10}(?:\\.\\d{1,2})?)\\s*(?:bdt|taka|tk\\.?|/=)", Pattern.CASE_INSENSITIVE);
        Matcher m = labeled.matcher(body);
        List<Double> labeledHits = new ArrayList<>();
        while (m.find()) {
            Double parsed = parseMoney(m.group(1));
            if (parsed != null && parsed >= minAmount && parsed <= maxAmount) {
                labeledHits.add(parsed);
            }
        }
        if (!labeledHits.isEmpty()) return labeledHits.get(0);

        // 3) Fallback: scan bare numbers inside provider bounds
        Pattern candidates = Pattern.compile("\\d{1,10}(?:\\.\\d{1,2})?");
        m = candidates.matcher(body);
        List<Double> candList = new ArrayList<>();
        while (m.find()) {
            Double parsed = parseMoney(m.group());
            if (parsed != null && parsed >= minAmount && parsed <= maxAmount) {
                candList.add(parsed);
            }
        }
        if (candList.size() == 1) return candList.get(0);
        
        // Prefer decimals
        List<Double> withDecimals = new ArrayList<>();
        for (Double d : candList) {
            if (d % 1.0 != 0.0) withDecimals.add(d);
        }
        if (withDecimals.size() == 1) return withDecimals.get(0);
        
        if (candList.isEmpty()) return null;
        // Return max as fallback
        Double max = candList.get(0);
        for (Double d : candList) {
            if (d > max) max = d;
        }
        return max;
    }

    private Double parseMoney(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        try {
            double v = Double.parseDouble(s.replace(",", ""));
            return Math.round(v * 100.0) / 100.0;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalizeTrx(String s) {
        return s.trim().replaceAll("^\\.+|\\.+$", "").toUpperCase();
    }
}