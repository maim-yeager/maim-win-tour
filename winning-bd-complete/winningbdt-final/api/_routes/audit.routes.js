const { route } = require('../_lib/router');
const { ok, handleError } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');

route('GET', '/admin/audit', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'audit.view');
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const action = asString(req.query.action, 60);
        const adminId = asString(req.query.adminId, 60);
        const snap = await db().ref('audit_logs').limitToLast(2000).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (action) items = items.filter(l => l.action === action);
        if (adminId) items = items.filter(l => l.adminId === adminId);
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

module.exports = {};