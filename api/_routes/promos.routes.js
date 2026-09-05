const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asNumber, asBool } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

function cleanPromo(b) {
    return {
        code: asString(b.code, 30).toUpperCase().replace(/[^A-Z0-9]/g, ''),
        reward: asNumber(b.reward, 0),
        rewardType: b.rewardType === 'percent' ? 'percent' : 'flat',
        minDeposit: asNumber(b.minDeposit, 0),
        usageLimit: asInt(b.usageLimit, 0),
        perUserLimit: asInt(b.perUserLimit, 1),
        startDate: asNumber(b.startDate, 0),
        expiryDate: asNumber(b.expiryDate, 0),
        status: b.status === 'inactive' ? 'inactive' : 'active'
    };
}

route('GET', '/admin/promos', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'promos.view');
        const snap = await db().ref('promo_codes').once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, promoId: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return ok(res, { promos: items });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/promos', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'promos.manage');
        const cleaned = cleanPromo(body(req));
        if (!cleaned.code) throw fail(400, 'CODE_REQUIRED', 'Promo code is required.');
        if (cleaned.reward <= 0) throw fail(400, 'REWARD_REQUIRED', 'Reward must be greater than zero.');
        const codeKey = cleaned.code.toLowerCase();
        const existing = await db().ref('promo_codes/' + codeKey).once('value');
        if (existing.exists()) throw fail(409, 'CODE_EXISTS', 'This promo code already exists.');
        await db().ref('promo_codes/' + codeKey).set(Object.assign({}, cleaned, {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: admin.id,
            usedCount: 0
        }));
        await auditLog({ admin, action: 'PROMO_CREATED', targetType: 'PROMO', targetId: codeKey });
        return ok(res, { code: codeKey });
    } catch (e) { return handleError(res, e); }
});

route('PUT', '/admin/promos/:code', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'promos.manage');
        const codeKey = asString(req.params.code, 30).toLowerCase();
        const existing = await db().ref('promo_codes/' + codeKey).once('value');
        if (!existing.exists()) throw fail(404, 'CODE_NOT_FOUND', 'Promo code not found.');
        const cleaned = cleanPromo(Object.assign({}, existing.val(), body(req)));
        await db().ref('promo_codes/' + codeKey).update(Object.assign({}, cleaned, {
            updatedAt: Date.now(), updatedBy: admin.id
        }));
        await auditLog({ admin, action: 'PROMO_EDITED', targetType: 'PROMO', targetId: codeKey });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/promos/:code/status', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'promos.manage');
        const codeKey = asString(req.params.code, 30).toLowerCase();
        const status = body(req).status === 'inactive' ? 'inactive' : 'active';
        await db().ref('promo_codes/' + codeKey).update({ status, updatedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: status === 'active' ? 'PROMO_ENABLED' : 'PROMO_DISABLED', targetType: 'PROMO', targetId: codeKey });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/promos/:code', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'promos.manage');
        const codeKey = asString(req.params.code, 30).toLowerCase();
        await db().ref('promo_codes/' + codeKey).remove();
        await auditLog({ admin, action: 'PROMO_DELETED', targetType: 'PROMO', targetId: codeKey });
        return ok(res, { deleted: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { cleanPromo };