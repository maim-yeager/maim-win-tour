// Minimal dependency-free router for Vercel serverless functions.
const registered = [];

function toRegExp(pattern) {
    const parts = pattern.split('/').filter(Boolean);
    const regParts = parts.map(p => {
        if (p.startsWith(':')) return '([^/]+)';
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp('^/?' + regParts.join('/') + '/?$');
}

function route(method, pattern, handler) {
    registered.push({ method: method.toUpperCase(), re: toRegExp(pattern), params: pattern.split('/').filter(p => p.startsWith(':')).map(p => p.slice(1)), handler });
}

function handle(req, res) {
    const pathname = (req.url || '/').split('?')[0];
    const method = req.method.toUpperCase();
    for (const r of registered) {
        if (r.method !== method) continue;
        const m = pathname.match(r.re);
        if (!m) continue;
        const params = {};
        r.params.forEach((p, i) => { params[p] = decodeURIComponent(m[i + 1]); });
        req.params = params;
        return r.handler(req, res);
    }
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
}

module.exports = { route, handle };