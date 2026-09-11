const { db } = require('./firebase');
const { fail } = require('./respond');

// =====================================================================
// THE ONLY place that mutates user wallet balances.
// Every change is atomic (RTDB transaction), recorded in an immutable
// ledger, and written to the user-facing transaction history.
// =====================================================================

// opts: { bucket: 'deposit'|'winning', amount: signed number (+/-),
//         type, method, refId, meta, reason }
async function applyWalletChange(uid, opts) {
    const bucket = opts.bucket === 'winning' ? 'winning' : 'deposit';
    const amount = Math.round((opts.amount || 0) * 100) / 100;
    if (!Number.isFinite(amount)) throw fail(400, 'INVALID_AMOUNT', 'Invalid amount.');

    // Idempotency: a refId may only be processed once per user.
    if (opts.refId) {
        const seen = await db().ref('wallet_ledger/' + uid).orderByChild('refId').equalTo(opts.refId).limitToFirst(1).once('value');
        if (seen.exists()) {
            let existing = null;
            seen.forEach(child => { existing = { key: child.key, ...child.val() }; });
            throw fail(409, 'DUPLICATE_TRANSACTION', 'This transaction has already been processed.');
        }
    }

    // Atomic balance update.
    const userRef = db().ref('users/' + uid);
    let newBalance = null;
    await userRef.child(bucket).transaction((current) => {
        const cur = Number(current) || 0;
        newBalance = Math.round((cur + amount) * 100) / 100;
        if (newBalance < 0) return undefined; // abort if negative
        return newBalance;
    });

    if (newBalance === null || newBalance === undefined) {
        throw fail(400, 'INSUFFICIENT_BALANCE', 'Insufficient balance.');
    }

    // Ledger entry (immutable financial record).
    const ledgerRef = db().ref('wallet_ledger/' + uid).push();
    const ledgerEntry = {
        bucket,
        amount,
        balanceAfter: newBalance,
        type: opts.type || 'ADJUSTMENT',
        method: opts.method || null,
        refId: opts.refId || null,
        reason: opts.reason || null,
        meta: opts.meta || null,
        createdAt: Date.now()
    };
    await ledgerRef.set(ledgerEntry);

    // User-facing transaction history (backward compatible node).
    const txRef = db().ref('transactions/' + uid).push();
    await txRef.set({
        type: opts.type || 'Adjustment',
        amount: Math.abs(amount),
        method: opts.method || 'Wallet',
        status: 'Success',
        date: new Date(ledgerEntry.createdAt).toLocaleString(),
        refId: opts.refId || ledgerRef.key,
        createdAt: ledgerEntry.createdAt
    });

    return { newBalance, ledgerKey: ledgerRef.key };
}

async function getWallet(uid) {
    const userSnap = await db().ref('users/' + uid).once('value');
    const user = userSnap.val() || {};
    const ledgerSnap = await db().ref('wallet_ledger/' + uid).orderByChild('createdAt').limitToLast(50).once('value');
    const ledger = [];
    if (ledgerSnap.exists()) {
        ledgerSnap.forEach(child => ledger.push({ id: child.key, ...child.val() }));
    }
    return {
        uid,
        username: user.username || null,
        deposit: Number(user.deposit) || 0,
        winning: Number(user.winning) || 0,
        total: (Number(user.deposit) || 0) + (Number(user.winning) || 0),
        ledger: ledger.reverse()
    };
}

async function requireWalletStats(uid) {
    const wallet = await getWallet(uid);
    return wallet;
}

module.exports = { applyWalletChange, getWallet, requireWalletStats };