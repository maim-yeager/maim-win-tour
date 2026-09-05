// Output helpers for consistent API responses.

function ok(res, data) {
    return res.status(200).json({ success: true, data });
}

function created(res, data) {
    return res.status(201).json({ success: true, data });
}

function fail(status, code, message) {
    const err = new Error(message);
    err.httpStatus = status;
    err.bizCode = code;
    return err;
}

function handleError(res, err) {
    const status = err.httpStatus || 500;
    const code = err.bizCode || 'INTERNAL_ERROR';
    const message = status >= 500 ? 'Something went wrong. Please try again.' : (err.message || 'Request failed.');
    if (status >= 500) console.error('[api]', err);
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

function body(req) {
    if (!req.body || typeof req.body !== 'object') return {};
    return req.body;
}

module.exports = { ok, created, fail, handleError, body };