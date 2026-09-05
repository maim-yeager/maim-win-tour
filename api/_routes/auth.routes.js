const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const {
    verifyPassword, createSession, authenticateAdmin, issueRecoveryCode,
    verifyRecoveryCode, hashToken
} = require('../_lib/auth');
const { asString } = require('../_lib/validate');
const { rateLimitOrThrow } = require('../_lib/ratelimit');
const { auditLog } = require('../_lib/audit');

// Logins are rate-limited server-side.
route('POST', '/admin/auth/login', async (req, res) => {
    try {
        rateLimitOrThrow('login:' + (req.ip || req.headers['x-forwarded-for'] || 'g'), 10, 60000);
        const b = body(req);
        const credential = asString(b.credential).toLowerCase(); // adminId or gmail
        const password = asString(b.password, 128);
        if (!credential || !password) throw fail(400, 'INVALID_CREDENTIALS', 'Please provide your credentials.');

        let admin = null;
        if (credential.includes('@')) {
            const snap = await db().ref('admin_accounts').orderByChild('email').equalTo(credential).limitToFirst(1).once('value');
            snap.forEach(child => { const v = child.val(); v.id = child.key; if (v.email === credential) admin = v; });
        } else {
            // Bootstrap stores admin keys upper-cased (e.g. OWNER1); legacy records
            // may be lower-cased. Try exact, upper, then lower so every format logs in.
            const rawCred = asString(b.credential);
            const upper = rawCred.toUpperCase();
            const lower = rawCred.toLowerCase();
            admin = await lookupAdminId(rawCred) || await lookupAdminId(upper) || await lookupAdminId(lower);
        }
        if (!admin) throw fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
        if (!verifyPassword(password, admin)) {
            await auditLog({ admin, action: 'FAILED_LOGIN', targetType: 'ADMIN', targetId: admin.id, result: 'FAILED', reason: 'wrong_password' });
            throw fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
        }
        if (admin.status === 'DISABLED') throw fail(403, 'ACCOUNT_DISABLED', 'This admin account is disabled.');
        const token = await createSession(admin.id, { ip: req.headers['x-forwarded-for'] || 'unknown', ua: req.headers['user-agent'] ? asString(req.headers['user-agent'], 300) : null });
        await auditLog({ admin, action: 'LOGIN', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { token, admin: sanitize(admin) });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/auth/logout', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        const token = (req.headers['authorization'] || '').slice(7).trim();
        await db().ref('admin_sessions/' + hashToken(token)).remove();
        await auditLog({ admin, action: 'LOGOUT', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { loggedOut: true });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/auth/me', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        return ok(res, { admin: sanitize(admin) });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/auth/security-code', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        rateLimitOrThrow('recovery:' + admin.id, 5, 3600000);
        const code = await issueRecoveryCode(admin.id);
        await auditLog({ admin, action: 'RECOVERY_CODE_GENERATED', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { code }); // returned to the authenticated admin only
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/auth/security-code/verify', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        const b = body(req);
        await verifyRecoveryCode(asString(b.code), admin.id);
        await auditLog({ admin, action: 'RECOVERY_CODE_VERIFIED', targetType: 'ADMIN', targetId: admin.id });
        return ok(res, { verified: true });
    } catch (e) { return handleError(res, e); }
});

function sanitize(admin) {
    return {
        id: admin.id,
        adminId: admin.adminId || admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        permissions: admin.permissions || {},
        createdAt: admin.createdAt || null
    };
}

async function lookupAdminId(adminId) {
    if (!adminId) return null;
    const snap = await db().ref('admin_accounts/' + adminId).once('value');
    if (snap.exists()) {
        const v = snap.val();
        // Normalize the stored id to the DB key so admin.id reflects reality.
        v.id = adminId;
        return v;
    }
    return null;
}
