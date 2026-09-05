// Simple in-memory sliding-window rate limiter keyed by actor identity.
// For production multi-instance deployments, move this to an external store.
const buckets = new Map();

function cleanup() {
    const now = Date.now();
    for (const [key, arr] of buckets) {
        while (arr.length && arr[0] < now - 60000) arr.shift();
        if (arr.length === 0) buckets.delete(key);
    }
}

function rateLimit(key, limit, windowMs = 60000) {
    cleanup();
    const now = Date.now();
    const arr = buckets.get(key) || [];
    const cutoff = now - windowMs;
    while (arr.length && arr[0] < cutoff) arr.shift();
    if (arr.length >= limit) return false;
    arr.push(now);
    buckets.set(key, arr);
    return true;
}

function rateLimitOrThrow(key, limit, windowMs) {
    if (!rateLimit(key, limit, windowMs)) {
        const { fail } = require('./respond');
        throw fail(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }
}

module.exports = { rateLimit, rateLimitOrThrow };