const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { getWallet } = require('../_lib/ledger');

const PAGE_SIZE = 50;

function sanitizeUser(raw) {
    const u = { ...raw };
    delete u.passwordHash; delete u.salt; delete u.password;
    return u;
}

route('GET', '/admin/users', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'users.view');
        const q = asString(req.query.q, 120).toLowerCase();
        const limit = Math.min(asInt(req.query.limit, 50) || 50, 100);
        const snap = await db().ref('users').limitToLast(500).once('value');
        let users = [];
        if (snap.exists()) snap.forEach(child => users.push({ uid: child.key, ...child.val() }));
        users = users.reverse();
        if (q) {
            users = users.filter(u =>
                (u.username || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q) ||
                (u.phone || '').toLowerCase().includes(q) ||
                (u.uid || '').toLowerCase().includes(q)
            );
        }
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: users.slice(start, start + limit).map(sanitizeUser), total: users.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/users/:uid', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'users.view');
        const snap = await db().ref('users/' + req.params.uid).once('value');
        if (!snap.exists()) throw fail(404, 'USER_NOT_FOUND', 'User not found.');
        const raw = { uid: req.params.uid, ...snap.val() };
        const wallet = await getWallet(req.params.uid);
        return ok(res, { user: sanitizeUser(raw), wallet });
    } catch (e) { return handleError(res, e); }
});

async function setUserStatus(admin, uid, status, reason) {
    requirePerm(admin, 'users.manage');
    const ref = db().ref('users/' + uid);
    const snap = await ref.once('value');
    if (!snap.exists()) throw fail(404, 'USER_NOT_FOUND', 'User not found.');
    await ref.update({ status, statusNote: asString(reason), updatedAt: Date.now() });
    await auditLog({ admin, action: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED', targetType: 'USER', targetId: uid, reason: asString(reason) });
}

route('POST', '/admin/users/suspend', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        const b = body(req);
        await setUserStatus(admin, asString(b.uid), 'suspended', b.reason);
        return ok(res, { suspended: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/users/unsuspend', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        const b = body(req);
        await setUserStatus(admin, asString(b.uid), 'active', b.reason);
        return ok(res, { unsuspended: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/users/note', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'users.manage');
        const b = body(req);
        const uid = asString(b.uid);
        const ref = db().ref('users/' + uid + '/admin_notes');
        const notes = await ref.once('value').then(s => s.val() || []);
        notes.push({ by: admin.id, text: asString(b.note, 2000), at: Date.now() });
        await ref.set(notes.slice(-20));
        await auditLog({ admin, action: 'ADMIN_NOTE', targetType: 'USER', targetId: uid });
        return ok(res, { saved: true });
    } catch (e) { return handleError(res, e); }
});