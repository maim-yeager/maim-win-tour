const { handle } = require('./_lib/router');
require('./_routes'); // registers all endpoints

// Vercel serverless default export — Handles every /api/* request.
module.exports = async function handler(req, res) {
    // Normalize the path: Vercel rewrites can keep the original "/api/..." prefix
    // or drop it depending on deployment. Strip it so both cases route correctly.
    const raw = req.url || '/';
    const pathOnly = raw.split('?')[0];
    req.url = pathOnly.replace(/^\/api(?=\/|$)/, '') + (raw.includes('?') ? '?' + raw.split('?')[1] : '');
    if (req.url === '' || req.url === '/') req.url = '/';
    // JSON body parsing (body is streamed by Vercel runtime)
    await new Promise((resolve) => {
        if (req.body !== undefined) { req.body = typeof req.body === 'string' ? safeParse(req.body) : req.body; return resolve(); }
        let data = '';
        req.on('data', c => { data += c; if (data.length > 1e6) { data = ''; req.destroy(); } });
        req.on('end', () => { req.body = safeParse(data); resolve(); });
        req.on('error', () => { req.body = {}; resolve(); });
    });
    return handle(req, res);
};

function safeParse(str) {
    try { return str ? JSON.parse(str) : {}; } catch (e) { return {}; }
}