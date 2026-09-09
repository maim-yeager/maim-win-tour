const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

// Notifications live at `notifications` — the node the existing User App already reads.
// Target-aware: a `target` map is stored for future segmenting but broadcasts remain
// fully compatible with the User App (title/body/time).

route('GET', '/admin/notifications', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'notifications.view');
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const snap = await db().ref('notifications').limitToLast(500).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || b.time || 0) - (a.createdAt || a.time || 0));
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/notifications', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'notifications.send');
        const b = body(req);
        const title = asString(b.title, 200);
        const bodyText = asString(b.body, 2000);
        if (!title) throw fail(400, 'TITLE_REQUIRED', 'Notification title is required.');
        const targetMap = ['all', 'new', 'active', 'inactive', 'deposit', 'withdrawal', 'match_participants', 'specific'];
        const target = targetMap.includes(b.target) ? b.target : 'all';
        const ref = db().ref('notifications').push();
        await ref.set({
            title,
            body: bodyText,
            time: new Date().toLocaleString(),
            target,
            targetUsers: target === 'specific' && Array.isArray(b.targetUsers) ? b.targetUsers.slice(0, 500) : null,
            createdBy: admin.id,
            createdAt: Date.now()
        });
        await auditLog({ admin, action: 'NOTIFICATION_BROADCAST', targetType: 'NOTIFICATION', targetId: ref.key, reason: target });
        return ok(res, { notificationId: ref.key });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/notifications/:id', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'notifications.view');
        await db().ref('notifications/' + req.params.id).remove();
        await auditLog({ admin, action: 'NOTIFICATION_DELETED', targetType: 'NOTIFICATION', targetId: req.params.id });
        return ok(res, { deleted: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = {};