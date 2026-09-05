const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateDevice, getDeviceById } = require('../_lib/device');
const { authenticateAdmin } = require('../_lib/auth');
const { asString, asNumber, asInt } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { rateLimitOrThrow } = require('../_lib/ratelimit');
const { applyWalletChange } = require('../_lib/ledger');
const { approveDepositFinance, rejectDeposit, getDeposit } = require('./deposits.routes');

// Admin-side access to SMS checker telemetry. The APK has its own
// device-scoped endpoints; the Admin Panel reads the same data (and
// honours the same sms.verify permission the device grants require).
function requireSmsAdminScope(admin) {
    if (!admin) throw fail(401, 'UNAUTHORIZED', 'Authentication required.');
    if (admin.role === 'OWNER') return true;
    if (admin.permissions && admin.permissions['sms.verify'] === true) return true;
    throw fail(403, 'FORBIDDEN', 'You do not have SMS verification permission.');
}

route('GET', '/admin/sms/stats', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireSmsAdminScope(admin);
        const deviceFilter = asString(req.query.deviceId, 120);
        const [txSnap, devicesSnap, auto] = await Promise.all([
            db().ref('sms_transactions').limitToLast(5000).once('value'),
            db().ref('admin_devices').once('value'),
            db().ref('app_settings/auto_verification_enabled').once('value')
        ]);
        const stats = { detected: 0, matched: 0, unmatched: 0, duplicate: 0, mismatch: 0, failed: 0, manualReview: 0, autoApproved: 0, manualApproved: 0 };
        if (txSnap.exists()) {
            txSnap.forEach(c => {
                const t = c.val() || {};
                if (deviceFilter && t.deviceId !== deviceFilter) return;
                stats.detected++;
                if (t.result === 'APPROVED') {
                    stats.autoApproved += (t.mode === 'AUTO' ? 1 : 0);
                    stats.manualApproved += (t.mode === 'MANUAL' ? 1 : 0);
                }
                if (t.result === 'MANUAL_REVIEW') stats.manualReview++;
                if (t.matchResult === 'MATCHED') stats.matched++;
                if (t.matchResult === 'UNMATCHED') stats.unmatched++;
                if (t.matchResult === 'DUPLICATE_TRANSACTION') stats.duplicate++;
                if (t.matchResult === 'AMOUNT_MISMATCH') stats.mismatch++;
                if (t.result === 'FAILED') stats.failed++;
            });
        }
        const devices = [];
        if (devicesSnap.exists()) devicesSnap.forEach(c => devices.push({ id: c.key, ...c.val() }));
        const connectedDevices = devices.filter(d => d.status === 'CONNECTED').length;
        return ok(res, { stats, connectedDevices, autoVerification: auto.val() === true });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/sms/transactions', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireSmsAdminScope(admin);
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const status = asString(req.query.status, 40);
        const matchResult = asString(req.query.matchResult, 40);
        const method = asString(req.query.method, 30).toLowerCase();
        const deviceFilter = asString(req.query.deviceId, 120);
        const q = asString(req.query.q, 120).toLowerCase();
        const snap = await db().ref('sms_transactions').limitToLast(5000).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (status) items = items.filter(t => t.result === status);
        if (matchResult) items = items.filter(t => t.matchResult === matchResult);
        if (method) items = items.filter(t => t.paymentMethod === method);
        if (deviceFilter) items = items.filter(t => t.deviceId === deviceFilter);
        if (q) items = items.filter(t =>
            (t.transactionId || '').toLowerCase().includes(q) ||
            (t.depositId || '').toLowerCase().includes(q) ||
            (t.deviceId || '').toLowerCase().includes(q));
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

module.exports = { isDupe, markIndex, recordSmsTx, getSmsConfig, requireSmsAdminScope };

// =====================================================================
// BUILT-IN SMS PAYMENT CHECKER (inside the Admin APK).
//
// The APK never decides financial outcomes. It only detects an SMS,
// parses (sender, trxId, amount, time), validates locally, fingerprints,
// and POSTs the structured payload here. This endpoint is the authority:
// it authenticates the device, validates data, de-duplicates, matches a
// pending deposit, and — only when auto-verification is enabled — credits
// the wallet atomically through the ledger. Otherwise it records the
// detected transaction for MANUAL_REVIEW by an authorized admin.
// =====================================================================

const PROVIDERS = ['bkash', 'nagad', 'rocket', 'bank', 'other'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function validTimestamp(ts) {
    const t = Number(ts);
    if (!Number.isFinite(t)) return false;
    if (t < 1000000000000) return false; // ms epoch guard
    if (t > Date.now() + 5 * 60000) return false; // not absurdly future
    return true;
}

// Parser configuration for the APK (no secrets). Managed server-side.
async function getSmsConfig() {
    const snap = await db().ref('app_settings/sms_config').once('value');
    const cfg = snap.val() || {};
    if (cfg && cfg.enabled === false) return { enabled: false, providers: {} };
    return { enabled: true, providers: cfg.providers || {} };
}

route('GET', '/sms-verification/config', async (req, res) => {
    try {
        const { device, admin } = await authenticateDevice(req);
        const config = await getSmsConfig();
        return ok(res, { config, device: { id: device.id, deviceName: device.deviceName, status: device.status }, balanceOfAuthority: 'backend' });
    } catch (e) { return handleError(res, e); }
});

async function isDupe(method, trxId) {
    const snap = await db().ref('sms_trx_index/' + method + '/' + trxId).once('value');
    return snap.exists();
}

async function findPendingDeposit(method, trxId) {
    const snap = await db().ref('deposit_txids/' + method + '/' + trxId).once('value');
    const depositId = snap.val();
    if (!depositId) return null;
    const d = await getDeposit(depositId);
    return d;
}

route('POST', '/sms-verification/transactions', async (req, res) => {
    try {
        const { device, admin } = await authenticateDevice(req);
        rateLimitOrThrow('sms_tx:' + device.id, 30, 60000);
        const b = body(req);
        const method = asString(b.paymentMethod, 30).toLowerCase();
        if (!PROVIDERS.includes(method)) throw fail(400, 'UNSUPPORTED_METHOD', 'Unsupported payment method.');
        const trxId = asString(b.transactionId, 64).toUpperCase();
        if (!/^[A-Z0-9._:\-]{4,64}$/.test(trxId)) throw fail(400, 'INVALID_TRANSACTION_ID', 'Invalid transaction ID.');
        const amount = round2(asNumber(b.amount, 0));
        if (amount <= 0) throw fail(400, 'INVALID_AMOUNT', 'Invalid amount.');
        const timestamp = asInt(b.timestamp, 0);
        if (!validTimestamp(timestamp)) throw fail(400, 'INVALID_TIMESTAMP', 'Invalid timestamp.');
        if (!asString(b.messageHash, 128)) throw fail(400, 'INVALID_HASH', 'Fingerprint required.');

        // Provider-level duplicate protection: a processed TxID never credits twice.
        if (await isDupe(method, trxId)) {
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'DUPLICATE_TRANSACTION', result: 'SKIPPED', depositId: null });
            return ok(res, { matchResult: 'DUPLICATE_TRANSACTION', credited: false, message: 'This transaction was already processed.' });
        }

        const cfg = await getSmsConfig();
        if (!cfg.enabled) throw fail(403, 'VERIFICATION_DISABLED', 'SMS verification is currently disabled.');

        const deposit = await findPendingDeposit(method, trxId);
        const autoEnabled = await db().ref('app_settings/auto_verification_enabled').once('value').then(s => s.val() === true);
        const autoEnabledNow = autoEnabled !== false;

        if (!deposit) {
            await markIndex(method, trxId);
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'UNMATCHED', result: 'STORED', depositId: null });
            await auditLog({ device, admin, action: 'PAYMENT_TX_UNMATCHED', targetType: 'PAYMENT', refId: trxId, result: 'UNMATCHED' });
            return ok(res, { matchResult: 'UNMATCHED', credited: false });
        }

        if (deposit.status === 'APPROVED') {
            await markIndex(method, trxId);
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'ALREADY_APPROVED', result: 'SKIPPED', depositId: deposit.id });
            return ok(res, { matchResult: 'ALREADY_APPROVED', credited: false });
        }
        if (deposit.status === 'REJECTED') {
            await markIndex(method, trxId);
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'ALREADY_REJECTED', result: 'SKIPPED', depositId: deposit.id });
            return ok(res, { matchResult: 'ALREADY_REJECTED', credited: false });
        }
        // Amount validations when the deposit already recorded an expected amount.
        if (deposit.amount && deposit.amount !== amount) {
            await markIndex(method, trxId);
            await db().ref('deposits/' + deposit.id).update({
                matchResult: 'AMOUNT_MISMATCH', smsTxId: trxId, smsAmount: amount, verificationMode: 'AUTO', updatedAt: Date.now()
            });
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'AMOUNT_MISMATCH', result: 'MANUAL_REVIEW', depositId: deposit.id });
            await auditLog({ device, admin, action: 'PAYMENT_AMOUNT_MISMATCH', targetType: 'DEPOSIT', targetId: deposit.id, refId: trxId, result: 'MANUAL_REVIEW' });
            return ok(res, { matchResult: 'AMOUNT_MISMATCH', credited: false, manualReview: true });
        }

        await markIndex(method, trxId);
        await db().ref('deposits/' + deposit.id).update({
            amount, smsTxId: trxId, smsAmount: amount, verificationMode: 'AUTO', matchResult: 'MATCHED', verifiedAt: Date.now(), updatedAt: Date.now()
        });

        if (autoEnabledNow) {
            const result = await approveDepositFinance(
                { deviceId: device.id },
                Object.assign({}, deposit, { paymentMethod: method, trxId, amount }),
                { amount, mode: 'AUTO' }
            );
            await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'MATCHED', result: 'APPROVED', depositId: deposit.id, mode: 'AUTO' });
            await auditLog({ device, admin, action: 'PAYMENT_AUTO_VERIFIED', targetType: 'DEPOSIT', targetId: deposit.id, refId: trxId, reason: 'Auto verification', result: 'SUCCESS' });
            return ok(res, { matchResult: 'MATCHED', credited: true, amount, auto: true });
        }

        // Auto-verification OFF → store for manual review. NO wallet credit.
        await recordSmsTx({ device, method, trxId, amount, timestamp, messageHash: b.messageHash, matchResult: 'MATCHED', result: 'MANUAL_REVIEW', depositId: deposit.id, mode: 'MANUAL' });
        await auditLog({ device, admin, action: 'PAYMENT_MANUAL_REVIEW', targetType: 'DEPOSIT', targetId: deposit.id, refId: trxId, result: 'MANUAL_REVIEW' });
        return ok(res, { matchResult: 'MATCHED', credited: false, manualReview: true, autoOff: true });
    } catch (e) { return handleError(res, e); }
});

async function markIndex(method, trxId) {
    await db().ref('sms_trx_index/' + method + '/' + trxId).set(Date.now());
}

async function recordSmsTx({ device, method, trxId, amount, timestamp, messageHash, matchResult, result, depositId, mode }) {
    const ref = db().ref('sms_transactions').push();
    await ref.set({
        deviceId: device.id,
        adminId: device.adminId,
        paymentMethod: method,
        transactionId: trxId,
        amount,
        detectedAt: timestamp,
        createdAt: Date.now(),
        messageHash,
        matchResult: matchResult || 'UNMATCHED',
        result: result || 'STORED',
        depositId: depositId || null,
        mode: mode || (result === 'APPROVED' ? 'AUTO' : 'MANUAL'),
        synced: true
    });
    return ref.key;
}

route('GET', '/sms-verification/stats', async (req, res) => {
    try {
        const { device } = await authenticateDevice(req);
        const [txSnap, auto] = await Promise.all([
            db().ref('sms_transactions').orderByChild('deviceId').equalTo(device.id).once('value'),
            db().ref('app_settings/auto_verification_enabled').once('value')
        ]);
        const stats = { detected: 0, matched: 0, unmatched: 0, duplicate: 0, mismatch: 0, failed: 0, manualReview: 0, autoApproved: 0 };
        if (txSnap.exists()) {
            txSnap.forEach(c => {
                const t = c.val() || {};
                stats.detected++;
                if (t.result === 'APPROVED') stats.autoApproved++;
                if (t.result === 'MANUAL_REVIEW') stats.manualReview++;
                if (t.matchResult === 'MATCHED') stats.matched++;
                if (t.matchResult === 'UNMATCHED') stats.unmatched++;
                if (t.matchResult === 'DUPLICATE_TRANSACTION') stats.duplicate++;
                if (t.matchResult === 'AMOUNT_MISMATCH') stats.mismatch++;
                if (t.result === 'FAILED') stats.failed++;
            });
        }
        return ok(res, {
            device: { id: device.id, deviceName: device.deviceName, status: device.status, lastSeen: device.lastSeen },
            autoVerification: auto.val() === true,
            stats
        });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/sms-verification/transactions', async (req, res) => {
    try {
        const { device } = await authenticateDevice(req);
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const snap = await db().ref('sms_transactions').orderByChild('deviceId').equalTo(device.id).limitToLast(500).once('value');
        const items = [];
        if (snap.exists()) snap.forEach(c => items.push({ id: c.key, ...c.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return ok(res, { transactions: items.slice(0, limit) });
    } catch (e) { return handleError(res, e); }
});