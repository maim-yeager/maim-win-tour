const { fail } = require('./respond');

function asNumber(v, def = 0) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
}

function asInt(v, def = 0) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
}

function asString(v, max = 2000) {
    if (v === undefined || v === null) return '';
    return String(v).slice(0, max).trim();
}

function asArray(v) {
    if (Array.isArray(v)) return v;
    return [];
}

function asBool(v) {
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return !!v;
}

function matchPositiveMoney(v) {
    const n = asNumber(v);
    if (!Number.isFinite(n) || n <= 0) throw fail(400, 'INVALID_AMOUNT', 'Please provide a valid positive amount.');
    return Math.round(n * 100) / 100;
}

function isSafeTrx(s) {
    return /^[A-Za-z0-9._:\-]{4,64}$/.test(s);
}

function requireTrx(v) {
    const s = asString(v).toUpperCase();
    if (!isSafeTrx(s)) throw fail(400, 'INVALID_TRANSACTION_ID', 'Please provide a valid transaction ID.');
    return s;
}

module.exports = { asNumber, asInt, asString, asArray, asBool, matchPositiveMoney, isSafeTrx, requireTrx };