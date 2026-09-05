const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asNumber, matchPositiveMoney, requireTrx } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { applyWalletChange } = require('../_lib/ledger');

async function getDeposit(id) {
    const snap = await db().ref('deposits/' + id).once('value');
    return snap.exists() ? { id, ...snap.val() } : null;
}

// Core financial action shared by manual approval AND the SMS auto-verifier.
// Idempotent: a deposit can only be approved once (refId DEP_<depositId>).
async function approveDepositFinance(actor, deposit, opts = {}) {
    if (deposit.status !== 'PENDING' && deposit.status !== 'MANUAL_REVIEW') {
        throw fail(409, 'ALREADY_PROCESSED', 'This deposit was already processed (' + deposit.status + ').');
    }
    const amount = matchPositiveMoney(opts.amount || deposit.amount);
    const methodName = (deposit.paymentMethod || '').toLowerCase();
    const trxId = requireTrx(deposit.trxId);
    const result = await applyWalletChange(deposit.userId, {
        bucket: 'deposit',
        amount,
        type: 'Deposit',
        method: methodName,
        refId: 'DEP_' + deposit.id,
        reason: 'Deposit verified',
        meta: { depositId: deposit.id, trxId, mode: opts.mode || 'MANUAL', by: actor.adminId || actor.id || null }
    });
    await db().ref('deposits/' + deposit.id).update({
        status: 'APPROVED',
        approvedAmount: amount,
        approvedBy: (actor.adminId || actor.id) || (actor.deviceId || null),
        verificationMode: opts.mode || deposit.verificationMode || 'MANUAL',
        updatedAt: Date.now()
    });
    return { amount, newBalance: result.newBalance, depositId: deposit.id };
}

async function rejectDeposit(actor, deposit, reason) {
    if (deposit.status !== 'PENDING' && deposit.status !== 'MANUAL_REVIEW') {
        throw fail(409, 'ALREADY_PROCESSED', 'This deposit was already processed.');
    }
    await db().ref('deposits/' + deposit.id).update({
        status: 'REJECTED',
        rejectReason: asString(reason, 500),
        approvedBy: (actor.adminId || actor.id) || (actor.deviceId || null),
        updatedAt: Date.now()
    });
}

route('GET', '/admin/deposits', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.view');
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const status = asString(req.query.status, 40);
        const q = asString(req.query.q, 120).toLowerCase();
        const snap = await db().ref('deposits').limitToLast(2000).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (status) items = items.filter(d => d.status === status);
        if (q) {
            items = items.filter(d =>
                (d.trxId || '').toLowerCase().includes(q) ||
                (d.userId || '').toLowerCase().includes(q) ||
                (d.id || '').toLowerCase().includes(q) ||
                (d.smsTxId || '').toLowerCase().includes(q));
        }
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/deposits/:id', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.view');
        const d = await getDeposit(req.params.id);
        if (!d) throw fail(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found.');
        return ok(res, { deposit: d });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/deposits/approve', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.approve');
        const b = body(req);
        const d = await getDeposit(asString(b.depositId, 100));
        if (!d) throw fail(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found.');
        const result = await approveDepositFinance(admin, d, { amount: asNumber(b.amount), mode: 'MANUAL' });
        await auditLog({ admin, action: 'DEPOSIT_APPROVED', targetType: 'DEPOSIT', targetId: d.id, refId: d.trxId, reason: 'Manual approval' });
        return ok(res, result);
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/deposits/reject', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.reject');
        const b = body(req);
        const d = await getDeposit(asString(b.depositId, 100));
        if (!d) throw fail(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found.');
        await rejectDeposit(admin, d, b.reason);
        await auditLog({ admin, action: 'DEPOSIT_REJECTED', targetType: 'DEPOSIT', targetId: d.id, refId: d.trxId, reason: asString(b.reason, 500), result: 'REJECTED' });
        return ok(res, { rejected: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/deposits/manual-review', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.verify');
        const b = body(req);
        const d = await getDeposit(asString(b.depositId, 100));
        if (!d) throw fail(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found.');
        if (d.status !== 'PENDING') throw fail(409, 'ALREADY_PROCESSED', 'Only pending deposits can move to manual review.');
        await db().ref('deposits/' + d.id).update({ status: 'MANUAL_REVIEW', updatedAt: Date.now(), verifiedBy: admin.id });
        await auditLog({ admin, action: 'DEPOSIT_MANUAL_REVIEW', targetType: 'DEPOSIT', targetId: d.id, refId: d.trxId });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/deposits/note', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'deposits.view');
        const b = body(req);
        const d = await getDeposit(asString(b.depositId, 100));
        if (!d) throw fail(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found.');
        const notes = await db().ref('deposits/' + d.id + '/notes').once('value').then(s => s.val() || []);
        (notes.push || Array.prototype.push).call(notes, { by: admin.id, text: asString(b.note, 1000), at: Date.now() });
        await db().ref('deposits/' + d.id + '/notes').set(notes.slice(-30));
        return ok(res, { saved: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { getDeposit, approveDepositFinance, rejectDeposit };