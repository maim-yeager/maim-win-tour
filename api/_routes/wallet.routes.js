const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, matchPositiveMoney } = require('../_lib/validate');
const { applyWalletChange, getWallet } = require('../_lib/ledger');
const { auditLog } = require('../_lib/audit');

route('GET', '/admin/wallet/:uid', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'wallet.view');
        const wallet = await getWallet(req.params.uid);
        return ok(res, { wallet });
    } catch (e) { return handleError(res, e); }
});

// Wallet adjustment: amount is signed (+credit / -debit). Never a raw overwrite.
route('POST', '/admin/wallet/adjust', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'wallet.adjust');
        const b = body(req);
        const uid = asString(b.uid);
        const bucket = b.bucket === 'winning' ? 'winning' : b.bucket === 'deposit' ? 'deposit' : null;
        if (!bucket) throw fail(400, 'INVALID_BUCKET', 'Bucket must be deposit or winning.');
        const amount = matchPositiveMoney(b.amount);
        const sign = b.direction === 'debit' ? -1 : 1;
        const reason = asString(b.reason, 500) || 'Admin adjustment';
        const refId = asString(b.reference, 120) || ('ADJ_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));

        if (!sign) throw new Error();
        const result = await applyWalletChange(uid, {
            bucket, amount: amount * sign,
            type: sign > 0 ? 'Admin Credit' : 'Admin Debit',
            method: 'Admin',
            refId,
            reason,
            meta: { adminId: admin.id }
        });
        await auditLog({ admin, action: sign > 0 ? 'WALLET_ADJUSTMENT_CREDIT' : 'WALLET_ADJUSTMENT_DEBIT', targetType: 'USER', targetId: uid, refId, reason });
        const wallet = await getWallet(uid);
        return ok(res, { result, wallet });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/wallet/:uid/ledger', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'wallet.view');
        const { getWallet } = require('../_lib/ledger');
        const w = await getWallet(req.params.uid);
        return ok(res, { ledger: w.ledger });
    } catch (e) { return handleError(res, e); }
});