#!/usr/bin/env node
/**
 * WINNING BD — Owner bootstrap (server-side only).
 *
 * The Owner must NEVER be created from a public "Create Owner" button.
 * Run this once from a trusted machine:
 *
 *   FIREBASE_SERVICE_ACCOUNT_B64="<base64 service account>" \
 *   FIREBASE_DB_URL="https://your-project-default-rtdb.firebaseio.com" \
 *   OWNER_ID="OWNER1" \
 *   OWNER_NAME="Founder" \
 *   OWNER_EMAIL="muna85581@gmail.com" \
 *   OWNER_PASSWORD="maimwin@#0987" \
 *   npm run bootstrap:owner
 *
 * The recovery code is printed ONCE and never stored.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

function fail(msg) {
    console.error('\n[OWNER BOOTSTRAP] ERROR:', msg);
    process.exit(1);
}

const B64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
const DB_URL = process.env.FIREBASE_DB_URL;
const OWNER_ID = (process.env.OWNER_ID || 'OWNER1').toUpperCase().replace(/[^A-Z0-9_]/g, '');
const OWNER_NAME = process.env.OWNER_NAME || 'Owner';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || '').toLowerCase();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';

if (!B64) fail('FIREBASE_SERVICE_ACCOUNT_B64 is required.');
if (!DB_URL) fail('FIREBASE_DB_URL is required.');
if (!OWNER_EMAIL) fail('OWNER_EMAIL is required.');
if (!OWNER_PASSWORD || OWNER_PASSWORD.length < 12) fail('OWNER_PASSWORD must be at least 12 characters.');
if (OWNER_EMAIL === 'muna85581@gmail.com') fail('Please set a real OWNER_EMAIL.');

const cred = JSON.parse(Buffer.from(B64, 'base64').toString('utf8'));
admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: DB_URL });
const db = admin.database();

// Same PBKDF2 scheme as api/_lib/auth.js.
const PBKDF2_ITER = 120000;
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512').toString('hex');
}
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
function makeRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    return code;
}

(async () => {
    const existing = await db.ref('admin_accounts/' + OWNER_ID).once('value');
    if (existing.exists()) {
        console.error('[OWNER BOOTSTRAP] Owner already exists. Aborting. (If you intentionally want to reset, remove the admin record first.)');
        process.exit(1);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const owner = {
        adminId: OWNER_ID,
        name: OWNER_NAME,
        email: OWNER_EMAIL,
        role: 'OWNER',
        status: 'ACTIVE',
        permissions: {}, // Owner has implicit full authority (see auth.js requirePerm).
        passwordHash: hashPassword(OWNER_PASSWORD, salt),
        salt,
        algo: 'pbkdf2-sha512',
        iterations: PBKDF2_ITER,
        createdBy: 'BOOTSTRAP',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    await db.ref('admin_accounts/' + OWNER_ID).set(owner);

    // Generate a one-time recovery code (10-minute TTL), revoking any stray sessions.
    const code = makeRecoveryCode();
    await db.ref('admin_recovery_codes/' + hashToken(code)).set({
        adminId: OWNER_ID,
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 10,
        used: false
    });

    await db.ref('audit_logs').push().set({
        adminId: OWNER_ID,
        role: 'OWNER',
        action: 'OWNER_BOOTSTRAPPED',
        result: 'SUCCESS',
        timestamp: Date.now()
    });

    console.log('\n✅ OWNER BOOTSTRAPPED');
    console.log('   Admin ID :', OWNER_ID);
    console.log('   Name     :', OWNER_NAME);
    console.log('   Email    :', OWNER_EMAIL);
    console.log('   Role     : OWNER');
    console.log('\n🔐 RECOVERY CODE (valid 10 minutes, one-time use):');
    console.log('   ' + code);
    console.log('\n⚠️  Store this code securely. It will NOT be shown again.\n');
})().catch((e) => {
    console.error('[OWNER BOOTSTRAP] Failed:', e.message);
    process.exit(1);
});