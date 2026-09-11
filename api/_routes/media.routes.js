const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

// Media Gallery — images admins can pick from when setting banners/promos.
// Rewritten to use this project's own dependency-free router (see _lib/router.js)
// instead of Express, which was never a listed dependency and made every API
// request fail at cold start (require('express') threw, crashing the whole
// _routes/index.js require chain — including login).

route('GET', '/admin/media', async (req, res) => {
    try {
        await authenticateAdmin(req);
        const snap = await db().ref('media_gallery').once('value');
        const items = [];
        if (snap.exists()) {
            snap.forEach(child => { items.push(Object.assign({ id: child.key }, child.val())); });
        }
        items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
        return ok(res, { items });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/media', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'settings.manage');
        const b = body(req);
        // asString caps length at 1000, but uploaded (base64 data: URL) images
        // need far more room than a normal http(s) link — raise the cap only
        // for that case so "Upload from gallery" doesn't get silently truncated.
        const rawUrl = typeof b.url === 'string' ? b.url.trim() : '';
        const isDataUrl = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(rawUrl);
        const url = isDataUrl ? asString(rawUrl, 8000000).trim() : asString(rawUrl, 1000).trim();
        const label = asString(b.label, 200).trim() || 'Image';
        if (!isDataUrl && !/^https?:\/\//i.test(url)) throw fail(400, 'INVALID_URL', 'A valid image URL is required.');

        const key = db().ref('media_gallery').push().key;
        const item = { url, label, uploadedAt: Date.now(), uploadedBy: admin.id };
        await db().ref('media_gallery/' + key).set(item);
        await auditLog({ admin, action: 'MEDIA_ADDED', targetType: 'MEDIA', targetId: key });
        return ok(res, { id: key, item: Object.assign({ id: key }, item) });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/media/:id', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'settings.manage');
        const id = asString(req.params.id, 200);
        await db().ref('media_gallery/' + id).remove();
        await auditLog({ admin, action: 'MEDIA_DELETED', targetType: 'MEDIA', targetId: id });
        return ok(res, {});
    } catch (e) { return handleError(res, e); }
});

module.exports = {};
