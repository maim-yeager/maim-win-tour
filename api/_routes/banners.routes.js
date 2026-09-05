const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asBool } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

// Banners live inside app_settings.banners (array) — the shape the User App slider reads.
async function readBanners() {
    const snap = await db().ref('app_settings/banners').once('value');
    const v = snap.val();
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
    return [];
}

function cleanBanner(b, idx) {
    return {
        img: asString(b.img, 1000),
        link: asString(b.link, 1000),
        title: asString(b.title, 200),
        active: asBool(b.active),
        displayOrder: asInt(b.displayOrder, idx),
        startDate: asInt(b.startDate, 0),
        endDate: asInt(b.endDate, 0)
    };
}

route('GET', '/admin/banners', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'banners.view');
        return ok(res, { banners: await readBanners() });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/banners', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'banners.manage');
        const banners = await readBanners();
        const cleaned = cleanBanner(body(req), banners.length);
        if (!cleaned.img) throw fail(400, 'IMAGE_REQUIRED', 'Banner image is required.');
        banners.push(Object.assign({}, cleaned, { id: 'bnr_' + Date.now(), createdBy: admin.id, createdAt: Date.now() }));
        await db().ref('app_settings/banners').set(banners);
        await auditLog({ admin, action: 'BANNER_CREATED', targetType: 'BANNER' });
        return ok(res, { banners });
    } catch (e) { return handleError(res, e); }
});

route('PUT', '/admin/banners/:idx', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'banners.manage');
        const idx = asInt(req.params.idx, -1);
        const banners = await readBanners();
        if (idx < 0 || idx >= banners.length) throw fail(404, 'BANNER_NOT_FOUND', 'Banner not found.');
        banners[idx] = Object.assign({}, banners[idx], cleanBanner(body(req), idx), { updatedBy: admin.id, updatedAt: Date.now() });
        await db().ref('app_settings/banners').set(banners);
        await auditLog({ admin, action: 'BANNER_EDITED', targetType: 'BANNER', targetId: String(idx) });
        return ok(res, { banners });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/banners/reorder', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'banners.manage');
        const order = Array.isArray(body(req).order) ? body(req).order : null;
        const banners = await readBanners();
        if (order) {
            const byId = {};
            banners.forEach((bn, i) => byId[bn.id || String(i)] = bn);
            const reordered = order.map(id => byId[id]).filter(Boolean);
            await db().ref('app_settings/banners').set(reordered);
            await auditLog({ admin, action: 'BANNER_REORDERED', targetType: 'BANNER' });
            return ok(res, { banners: reordered });
        }
        return ok(res, { banners });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/banners/:idx', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'banners.manage');
        const idx = asInt(req.params.idx, -1);
        const banners = await readBanners();
        if (idx < 0 || idx >= banners.length) throw fail(404, 'BANNER_NOT_FOUND', 'Banner not found.');
        banners.splice(idx, 1);
        await db().ref('app_settings/banners').set(banners);
        await auditLog({ admin, action: 'BANNER_DELETED', targetType: 'BANNER', targetId: String(idx) });
        return ok(res, { banners });
    } catch (e) { return handleError(res, e); }
});

module.exports = { readBanners };