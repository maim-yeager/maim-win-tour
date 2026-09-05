const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requireRole, ROLE_LEVEL, makePasswordRecord, verifyPassword, issueRecoveryCode, hashToken } = require('../_lib/auth');
const { asString, asInt, asBool } = require('../_lib/validate');
const { rateLimitOrThrow } = require('../_lib/ratelimit');
const { auditLog } = require('../_lib/audit');

// Granular permission catalog. An admin only ever receives these keys.
const PERMISSIONS = {
    'users.view': 'View users', 'users.manage': 'Suspend / note users',
    'wallet.view': 'View wallets', 'wallet.adjust': 'Adjust wallets',
    'categories.view': 'View categories', 'categories.create': 'Create categories', 'categories.edit': 'Edit categories',
    'matches.view': 'View matches', 'matches.create': 'Create matches', 'matches.edit': 'Edit matches', 'matches.cancel': 'Cancel matches',
    'deposits.view': 'View deposits', 'deposits.verify': 'Manual review', 'deposits.approve': 'Approve deposits', 'deposits.reject': 'Reject deposits',
    'withdrawals.view': 'View withdrawals', 'withdrawals.approve': 'Approve withdrawals', 'withdrawals.reject': 'Reject withdrawals',
    'withdrawals.process': 'Process withdrawals', 'withdrawals.complete': 'Complete withdrawals',
    'referrals.view': 'View referrals', 'referrals.manage': 'Manage referral rewards',
    'promos.view': 'View promos', 'promos.manage': 'Manage promo codes',
    'notifications.view': 'View notifications', 'notifications.send': 'Send notifications',
    'banners.view': 'View banners', 'banners.manage': 'Manage banners',
    'reports.view': 'View reports', 'analytics.view': 'View analytics',
    'admins.view': 'View admins', 'admins.create': 'Create admins', 'admins.manage': 'Edit admins',
    'audit.view': 'View audit logs', 'security.view': 'View security center', 'security.manage': 'Security actions',
    'settings.view': 'View settings', 'settings.manage': 'Edit settings',
    'devices.view': 'View devices', 'devices.manage': 'Manage devices',
    'sms.verify': 'SMS verification (device access)'
};

function defaultPermissions(role) {
    const all = {};
    Object.keys(PERMISSIONS).forEach(k => { all[k] = true; });
    if (role === 'SUPER_ADMIN') {
        // Super Admin may not touch owner-level / dangerous security.
        ['admins.create', 'admins.manage'].forEach(k => { all[k] = true; });
        return all;
    }
    if (role === 'ADMIN') {
        // Conservative default: read-mostly. Owners grant more via permissions.
        Object.keys(all).forEach(k => { all[k] = false; });
        ['users.view', 'wallet.view', 'categories.view', 'matches.view', 'deposits.view',
         'withdrawals.view', 'referrals.view', 'promos.view', 'notifications.view',
         'banners.view', 'reports.view', 'analytics.view', 'audit.view', 'settings.view'].forEach(k => { all[k] = true; });
        return all;
    }
    return all;
}

function sanitize(admin) {
    return {
        id: admin.id,
        adminId: admin.adminId || admin.id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        status: admin.status || 'ACTIVE',
        permissions: admin.permissions || {},
        createdAt: admin.createdAt || null
    };
}

function canManage(actor, target) {
    const a = ROLE_LEVEL[actor.role] || 0;
    const t = ROLE_LEVEL[target.role || 'ADMIN'] || 1;
    if (target.role === 'OWNER') return false;
    return a > t;
}

async function getAdmin(adminId) {
    const snap = await db().ref('admin_accounts/' + adminId).once('value');
    return snap.exists() ? { ...snap.val(), id: adminId } : null;
}

route('GET', '/admin/admins', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const snap = await db().ref('admin_accounts').once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push(sanitize({ id: child.key, ...child.val() })));
        items.sort((a, b) => (a.role === b.role ? (a.createdAt || 0) - (b.createdAt || 0) : ROLE_LEVEL[b.role] - ROLE_LEVEL[a.role]));
        return ok(res, { admins: items, permissions: PERMISSIONS });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/admins', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        rateLimitOrThrow('create_admin:' + admin.id, 5, 3600000);
        const b = body(req);
        const adminId = asString(b.adminId, 60).replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
        const role = b.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';
        const password = asString(b.password, 128);
        if (!adminId || adminId.length < 3) throw fail(400, 'INVALID_ADMIN_ID', 'Provide a unique Admin ID.');
        if (role === 'SUPER_ADMIN' && admin.role !== 'OWNER') throw fail(403, 'FORBIDDEN', 'Only the Owner can create Super Admins.');
        if (!password || password.length < 8) throw fail(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
        const existing = await db().ref('admin_accounts/' + adminId).once('value');
        if (existing.exists()) throw fail(409, 'ADMIN_EXISTS', 'Admin ID already exists.');
        const email = asString(b.email, 200).toLowerCase();
        const rec = makePasswordRecord(password);
        await db().ref('admin_accounts/' + adminId).set({
            adminId,
            name: asString(b.name, 120),
            email,
            phone: asString(b.phone, 30),
            role,
            status: 'ACTIVE',
            permissions: defaultPermissions(role),
            passwordHash: rec.hash,
            salt: rec.salt,
            algo: rec.algo,
            iterations: rec.iterations,
            createdBy: admin.id,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        await auditLog({ admin, action: role === 'SUPER_ADMIN' ? 'SUPER_ADMIN_CREATED' : 'ADMIN_CREATED', targetType: 'ADMIN', targetId: adminId });
        return ok(res, { adminId });
    } catch (e) { return handleError(res, e); }
});

route('PUT', '/admin/admins/:adminId', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const targetId = asString(req.params.adminId, 60);
        const target = await getAdmin(targetId);
        if (!target) throw fail(404, 'ADMIN_NOT_FOUND', 'Admin not found.');
        if (!canManage(admin, target)) throw fail(403, 'FORBIDDEN', 'You cannot manage this admin.');
        const b = body(req);
        const updates = { updatedBy: admin.id, updatedAt: Date.now() };
        if (b.name !== undefined) updates.name = asString(b.name, 120);
        if (b.email !== undefined) updates.email = asString(b.email, 200).toLowerCase();
        if (b.phone !== undefined) updates.phone = asString(b.phone, 30);
        if (b.password) {
            const rec = makePasswordRecord(asString(b.password, 128));
            if (!b.password || b.password.length < 8) throw fail(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
            updates.passwordHash = rec.hash; updates.salt = rec.salt; updates.algo = rec.algo; updates.iterations = rec.iterations;
        }
        if (b.role) {
            const newRole = ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(b.role) ? b.role : null;
            if (!newRole) throw fail(400, 'INVALID_ROLE', 'Invalid role.');
            if (newRole === 'OWNER') throw fail(403, 'FORBIDDEN', 'Ownership cannot be transferred through this endpoint.');
            if (newRole !== target.role && !canManage(admin, target)) throw fail(403, 'FORBIDDEN', 'You cannot change this admin role.');
            if (newRole === 'SUPER_ADMIN' && admin.role !== 'OWNER') throw fail(403, 'FORBIDDEN', 'Only the Owner can set Super Admin.');
            updates.role = newRole;
            if (target.role !== newRole) updates.permissions = defaultPermissions(newRole);
        }
        await db().ref('admin_accounts/' + targetId).update(updates);
        await auditLog({ admin, action: 'ADMIN_EDITED', targetType: 'ADMIN', targetId: targetId });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/admins/:adminId/permissions', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const targetId = asString(req.params.adminId, 60);
        const target = await getAdmin(targetId);
        if (!target) throw fail(404, 'ADMIN_NOT_FOUND', 'Admin not found.');
        if (!canManage(admin, target) || target.role === 'SUPER_ADMIN' && admin.role !== 'OWNER') {
            throw fail(403, 'FORBIDDEN', 'You cannot modify this admin permissions.');
        }
        if (target.role === 'OWNER') throw fail(403, 'FORBIDDEN', 'Owner permissions cannot be modified.');
        const incoming = body(req).permissions || {};
        const clean = {};
        Object.keys(PERMISSIONS).forEach(k => { clean[k] = asBool(incoming[k]); });
        await db().ref('admin_accounts/' + targetId).update({ permissions: clean, updatedBy: admin.id, updatedAt: Date.now() });
        await auditLog({ admin, action: 'PERMISSION_CHANGED', targetType: 'ADMIN', targetId: targetId });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/admins/:adminId/status', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const targetId = asString(req.params.adminId, 60);
        const target = await getAdmin(targetId);
        if (!target) throw fail(404, 'ADMIN_NOT_FOUND', 'Admin not found.');
        if (!canManage(admin, target)) throw fail(403, 'FORBIDDEN', 'You cannot manage this admin.');
        const status = asString(body(req).status, 20) === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
        await db().ref('admin_accounts/' + targetId).update({ status, updatedBy: admin.id, updatedAt: Date.now() });
        // Revoke sessions when disabled.
        if (status === 'DISABLED') {
            const snap = await db().ref('admin_sessions').orderByChild('adminId').equalTo(targetId).once('value');
            const updates = {};
            snap.forEach(c => { updates[c.key] = null; });
            if (Object.keys(updates).length) await db().ref('admin_sessions').update(updates);
        }
        await auditLog({ admin, action: status === 'DISABLED' ? 'ADMIN_DISABLED' : 'ADMIN_ENABLED', targetType: 'ADMIN', targetId: targetId });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/admins/:adminId', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const targetId = asString(req.params.adminId, 60);
        const target = await getAdmin(targetId);
        if (!target) throw fail(404, 'ADMIN_NOT_FOUND', 'Admin not found.');
        if (!canManage(admin, target)) throw fail(403, 'FORBIDDEN', 'You cannot delete this admin.');
        if (target.role === 'OWNER') throw fail(403, 'FORBIDDEN', 'The Owner cannot be deleted.');
        const snap = await db().ref('admin_sessions').orderByChild('adminId').equalTo(targetId).once('value');
        const updates = {};
        snap.forEach(c => { updates[c.key] = null; });
        if (Object.keys(updates).length) await db().ref('admin_sessions').update(updates);
        await db().ref('admin_accounts/' + targetId).remove();
        await auditLog({ admin, action: 'ADMIN_DELETED', targetType: 'ADMIN', targetId: targetId });
        return ok(res, { deleted: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/admins/:adminId/recovery-code', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const targetId = asString(req.params.adminId, 60);
        const target = await getAdmin(targetId);
        if (!target) throw fail(404, 'ADMIN_NOT_FOUND', 'Admin not found.');
        if (!canManage(admin, target)) throw fail(403, 'FORBIDDEN', 'You cannot issue a recovery code for this admin.');
        rateLimitOrThrow('recovery_issue:' + admin.id, 10, 3600000);
        const code = await issueRecoveryCode(targetId);
        await auditLog({ admin, action: 'RECOVERY_CODE_GENERATED', targetType: 'ADMIN', targetId: targetId });
        // Code is shown once to the requesting authority, never persisted.
        return ok(res, { code, expiresInMinutes: 10 });
    } catch (e) { return handleError(res, e); }
});

module.exports = { PERMISSIONS, defaultPermissions, sanitizeAdmin: sanitize };