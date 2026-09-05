const crypto = require('crypto');
const { db } = require('./firebase');
const { fail } = require('./respond');

// ============ Role hierarchy ============
// OWNER > SUPER_ADMIN > ADMIN. The higher level can manage lower levels.
const ROLE_LEVEL = { OWNER: 3, SUPER_ADMIN: 2, ADMIN: 1 };

// ============ Password hashing (PBKDF2, server-side only) ============
const PBKDF2_ITER = 120000;

function hashPassword(password, salt) {
    const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512');
    return derived.toString('hex');
}

function makePasswordRecord(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: hashPassword(password, salt), algo: 'pbkdf2-sha512', iterations: PBKDF2_ITER };
}

function verifyPassword(password, record) {
    // Supports both bootstrap format ("passwordHash") and any legacy
    // internal record format ("hash"). Both are PBKDF2-SHA512, 120000 iters.
    if (!record) return false;
    const stored = record.passwordHash || record.hash;
    if (!stored || !record.salt) return false;
    // Invalid/non-string inputs must never throw — always degrade to false.
    if (typeof password !== 'string' || typeof stored !== 'string' || typeof record.salt !== 'string') return false;
    let candidate, expected;
    try {
        candidate = Buffer.from(hashPassword(password, record.salt), 'hex');
        expected = Buffer.from(stored, 'hex');
    } catch (e) {
        return false;
    }
    if (candidate.length !== expected.length || expected.length === 0) return false;
    return crypto.timingSafeEqual(candidate, expected);
}

// ============ Session tokens ============
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Session TTL: ADMIN_SESSION_TTL env (ms) overrides; default 24 hours.
const SESSION_TTL_MS = (() => {
    const v = parseInt(process.env.ADMIN_SESSION_TTL, 10);
    return Number.isFinite(v) && v > 0 ? v : 1000 * 60 * 60 * 24;
})();

async function createSession(adminId, metadata) {
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const meta = (metadata && typeof metadata === 'object') ? metadata : {};
    await db().ref('admin_sessions/' + tokenHash).set({
        adminId,
        ip: typeof meta.ip === 'string' ? meta.ip.slice(0, 64) : null,
        ua: typeof meta.ua === 'string' ? meta.ua.slice(0, 300) : null,
        device: meta,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS
    });
    return token;
}

// ============ Admin identity lookup ============
async function getAdminById(adminId) {
    const snap = await db().ref('admin_accounts/' + adminId).once('value');
    return snap.val() ? { ...snap.val(), id: adminId } : null;
}

// Authenticate an admin via a session Bearer token. Never trust client-claimed identity.
async function authenticateAdmin(req) {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    const token = header.slice(7).trim();
    if (!token) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    const sessionSnap = await db().ref('admin_sessions/' + hashToken(token)).once('value');
    const session = sessionSnap.val();
    if (!session) throw fail(401, 'SESSION_INVALID', 'Session invalid or expired. Please login again.');
    if (session.expiresAt && session.expiresAt < Date.now()) {
        await db().ref('admin_sessions/' + hashToken(token)).remove();
        throw fail(401, 'SESSION_EXPIRED', 'Session expired. Please login again.');
    }
    const admin = await getAdminById(session.adminId);
    if (!admin) throw fail(401, 'ADMIN_NOT_FOUND', 'Admin account not found.');
    if (admin.status === 'DISABLED') throw fail(403, 'ACCOUNT_DISABLED', 'This admin account is disabled.');
    // refresh expiry
    await db().ref('admin_sessions/' + hashToken(token)).update({ expiresAt: Date.now() + SESSION_TTL_MS });
    admin.session = session;
    return admin;
}

// ============ RBAC ============
function returnRole(role) { return ROLE_LEVEL[role] || 0; }

function requireRole(admin, minRole) {
    if (!admin) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    const min = returnRole(minRole);
    const cur = returnRole(admin.role);
    if (cur < min) throw fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    return true;
}

function requirePerm(admin, perm) {
    if (!admin) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    if (admin.role === 'OWNER') return true; // Owner has implicit full authority
    const perms = admin.permissions || {};
    if (perms[perm] === true) return true;
    throw fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
}

function requirePermOrRole(admin, perm, minRole) {
    if (!admin) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    if (ROLE_LEVEL[admin.role] >= returnRole(minRole)) return true;
    return requirePerm(admin, perm);
}

// ============ Verified Firebase user identity (for User App endpoints) ============
async function authenticateUser(req) {
    const { auth } = require('./firebase');
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    const token = header.slice(7).trim();
    if (!token) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    try {
        const decoded = await auth().verifyIdToken(token);
        return decoded;
    } catch (e) {
        throw fail(401, 'INVALID_TOKEN', 'Your session is invalid. Please sign in again.');
    }
}

// ============ Recovery codes ============
const RECOVERY_TTL_MS = 1000 * 60 * 10; // 10 minutes

function generateRecoveryCode() {
    // 8 char, unambiguous alphabet
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    return code;
}

async function issueRecoveryCode(adminId) {
    await db().ref('admin_sessions').orderByChild('adminId').equalTo(adminId).once('value').then(snap => {
        const updates = {};
        snap.forEach(child => { updates[child.key] = null; });
        if (Object.keys(updates).length) return db().ref('admin_sessions').update(updates);
        return null;
    });
    const code = generateRecoveryCode();
    const codeHash = hashToken(code);
    await db().ref('admin_recovery_codes/' + codeHash).set({
        adminId,
        createdAt: Date.now(),
        expiresAt: Date.now() + RECOVERY_TTL_MS,
        used: false
    });
    return code;
}

async function verifyRecoveryCode(code, adminId) {
    const codeHash = hashToken(String(code || '').trim().toUpperCase());
    const snap = await db().ref('admin_recovery_codes/' + codeHash).once('value');
    const rec = snap.val();
    if (!rec) throw fail(401, 'INVALID_CODE', 'Invalid security code.');
    if (rec.used) throw fail(401, 'CODE_USED', 'This security code has already been used.');
    if (rec.expiresAt && rec.expiresAt < Date.now()) {
        await snap.ref.remove();
        throw fail(401, 'CODE_EXPIRED', 'This security code has expired.');
    }
    if (rec.adminId !== adminId) throw fail(401, 'INVALID_CODE', 'Invalid security code.');
    await db().ref('admin_recovery_codes/' + codeHash).update({ used: true, usedAt: Date.now() });
    return true;
}

module.exports = {
    ROLE_LEVEL, returnRole, hashPassword, makePasswordRecord, verifyPassword,
    hashToken, generateSessionToken, createSession, SESSION_TTL_MS,
    getAdminById, authenticateAdmin, requireRole, requirePerm, requirePermOrRole,
    authenticateUser, issueRecoveryCode, verifyRecoveryCode, RECOVERY_TTL_MS
};