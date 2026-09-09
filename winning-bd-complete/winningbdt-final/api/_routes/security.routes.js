const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requireRole, requirePerm, hashToken } = require('../_lib/auth');
const { asString } = require('../_lib/validate');
const { rateLimitOrThrow } = require('../_lib/ratelimit');
const { auditLog } = require('../_lib/audit');

route('GET', '/admin/security/center', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'security.view');
        const [sessionsSnap, devicesSnap, auditSnap] = await Promise.all([
            db().ref('admin_sessions').orderByChild('adminId').equalTo(admin.id).once('value'),
            db().ref('admin_devices').orderByChild('adminId').equalTo(admin.id).once('value'),
            db().ref('audit_logs').limitToLast(200).once('value')
        ]);
        const sessions = [];
        sessionsSnap.forEach(c => sessions.push({ id: c.key, ...c.val() }));
        const devices = [];
        devicesSnap.forEach(c => devices.push({ id: c.key, ...c.val() }));
        const events = [];
        auditSnap.forEach(c => {
            const e = c.val() || {};
            if (e.adminId === admin.id) events.push({ id: c.key, ...e });
        });
        events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return ok(res, {
            admin: { id: admin.id, name: admin.name, role: admin.role, status: admin.status },
            permissions: admin.permissions || {},
            sessions: sessions.map(s => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, device: s.device })),
            devices: devices.map(d => ({ id: d.id, deviceName: d.deviceName, status: d.status, tokenStatus: d.tokenStatus, lastSeen: d.lastSeen })),
            events: events.slice(0, 50)
        });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/security/logout-all-sessions', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'security.manage');
        const currentToken = (req.headers['authorization'] || '').split(' ')[1];
        const snap = await db().ref('admin_sessions').orderByChild('adminId').equalTo(admin.id).once('value');
        const updates = {};
        snap.forEach(c => { if (c.key !== hashToken(currentToken || 'x')) updates[c.key] = null; });
        if (Object.keys(updates).length) await db().ref('admin_sessions').update(updates);
        await auditLog({ admin, action: 'SESSIONS_REVOKED', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { revoked: Object.keys(updates).length });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/security/verify-password', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        rateLimitOrThrow('verify_pass:' + admin.id, 5, 60000);
        const { verifyPassword } = require('../_lib/auth');
        const password = asString(body(req).password, 128);
        if (!password) throw fail(400, 'PASSWORD_REQUIRED', 'Password required.');
        if (!verifyPassword(password, admin)) {
            await auditLog({ admin, action: 'SECURITY_VERIFY_FAILED', targetType: 'ADMIN', targetId: admin.id, result: 'FAILED' });
            throw fail(401, 'INVALID_PASSWORD', 'Incorrect password. Sensitive action cancelled.');
        }
        await auditLog({ admin, action: 'SECURITY_VERIFY_OK', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { verified: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/security/change-password', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        rateLimitOrThrow('change_pass:' + admin.id, 5, 60000);
        const { makePasswordRecord, verifyPassword } = require('../_lib/auth');
        const currentPass = asString(body(req).currentPassword, 128);
        const newPass = asString(body(req).newPassword, 128);
        if (!currentPass || !newPass) throw fail(400, 'PASSWORD_REQUIRED', 'Provide current and new password.');
        if (newPass.length < 8) throw fail(400, 'WEAK_PASSWORD', 'New password must be at least 8 characters.');
        if (!verifyPassword(currentPass, admin)) throw fail(401, 'INVALID_PASSWORD', 'Current password is incorrect.');
        const rec = makePasswordRecord(newPass);
        await db().ref('admin_accounts/' + admin.id).update({
            passwordHash: rec.hash, salt: rec.salt, algo: rec.algo, iterations: rec.iterations,
            passwordChangedAt: Date.now(), updatedAt: Date.now()
        });
        // Revoke other sessions so the new password is enforced everywhere except this one.
        const currentToken = (req.headers['authorization'] || '').split(' ')[1];
        const hashTokenFn = require('../_lib/auth').hashToken;
        const snap = await db().ref('admin_sessions').orderByChild('adminId').equalTo(admin.id).once('value');
        const updates = {};
        snap.forEach(c => { if (c.key !== hashTokenFn(currentToken || 'x')) updates[c.key] = null; });
        if (Object.keys(updates).length) await db().ref('admin_sessions').update(updates);
        await auditLog({ admin, action: 'PASSWORD_CHANGED', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { changed: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = {};