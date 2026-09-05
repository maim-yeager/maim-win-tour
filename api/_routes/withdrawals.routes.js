const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asNumber, matchPositiveMoney } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { applyWalletChange } = require('../_lib/ledger');

async function getWithdrawal(id) {
    const snap = await db().ref('withdrawals/' + id).once('value');
    return snap.exists() ? { id, ...snap.val() } : null;
}

function checkState(w, id, allowStatuses) {
    if (!w) throw fail(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
    if (!allowStatuses.includes(w.status)) throw fail(409, 'INVALID_STATE', 'Withdrawal is not in a valid state for this action.');
}

route('GET', '/admin/withdrawals', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.view');
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const status = asString(req.query.status, 40);
        const q = asString(req.query.q, 120).toLowerCase();
        const snap = await db().ref('withdrawals').limitToLast(2000).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (status) items = items.filter(w => w.status === status);
        if (q) items = items.filter(w =>
            (w.id || '').toLowerCase().includes(q) ||
            (w.userId || '').toLowerCase().includes(q) ||
            (w.number || '').toLowerCase().includes(q));
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/withdrawals/:id', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.view');
        const w = await getWithdrawal(req.params.id);
        if (!w) throw fail(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
        return ok(res, { withdrawal: w });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/withdrawals/approve', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.approve');
        const b = body(req);
        const w = await getWithdrawal(asString(b.id, 100));
        checkState(w, b.id, ['PENDING']);
        await db().ref('withdrawals/' + w.id).update({ status: 'APPROVED', approvedBy: admin.id, approvedAt: Date.now(), updatedAt: Date.now() });
        await auditLog({ admin, action: 'WITHDRAWAL_APPROVED', targetType: 'WITHDRAWAL', targetId: w.id, refId: w.userId });
        return ok(res, { approved: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/withdrawals/reject', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.reject');
        const b = body(req);
        const w = await getWithdrawal(asString(b.id, 100));
        checkState(w, b.id, ['PENDING', 'APPROVED', 'PROCESSING']);
        // Refund the reserved winning balance (idempotent via refId).
        await applyWalletChange(w.userId, {
            bucket: 'winning',
            amount: asNumber(w.amount, 0),
            type: 'Withdrawal Refund',
            method: 'Admin',
            refId: 'WDL_REF_' + w.id,
            reason: 'Withdrawal rejected: ' + asString(b.reason, 300),
            meta: { withdrawalId: w.id }
        });
        await db().ref('withdrawals/' + w.id).update({ status: 'REJECTED', rejectReason: asString(b.reason, 500), approvedBy: admin.id, updatedAt: Date.now() });
        await auditLog({ admin, action: 'WITHDRAWAL_REJECTED', targetType: 'WITHDRAWAL', targetId: w.id, reason: asString(b.reason, 300), result: 'REJECTED' });
        return ok(res, { rejected: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/withdrawals/process', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.process');
        const b = body(req);
        const w = await getWithdrawal(asString(b.id, 100));
        checkState(w, b.id, ['APPROVED']);
        await db().ref('withdrawals/' + w.id).update({
            status: 'PROCESSING',
            providerRef: asString(b.providerRef, 120),
            processedBy: admin.id,
            processedAt: Date.now(),
            updatedAt: Date.now()
        });
        await auditLog({ admin, action: 'WITHDRAWAL_PROCESSED', targetType: 'WITHDRAWAL', targetId: w.id, refId: asString(b.providerRef, 120) });
        return ok(res, { processed: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/withdrawals/complete', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'withdrawals.complete');
        const b = body(req);
        const w = await getWithdrawal(asString(b.id, 100));
        checkState(w, b.id, ['PROCESSING']);
        await db().ref('withdrawals/' + w.id).update({
            status: 'COMPLETED',
            providerRef: asString(b.providerRef || w.providerRef, 120),
            completedBy: admin.id,
            completedAt: Date.now(),
            updatedAt: Date.now()
        });
        await auditLog({ admin, action: 'WITHDRAWAL_COMPLETED', targetType: 'WITHDRAWAL', targetId: w.id, refId: asString(b.providerRef, 120) });
        return ok(res, { completed: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { getWithdrawal };