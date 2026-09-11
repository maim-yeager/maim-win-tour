const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateUser } = require('../_lib/auth');
const { asString, asNumber, asInt, matchPositiveMoney } = require('../_lib/validate');
const { rateLimitOrThrow } = require('../_lib/ratelimit');
const { applyWalletChange } = require('../_lib/ledger');

// =====================================================================
// USER-FACING ENDPOINTS for the existing User App.
// The frontend NEVER decides wallet/balance results. Every financial
// mutation happens here atomically through the ledger.
// =====================================================================

async function getSettings() {
    const snap = await db().ref('app_settings').once('value');
    return snap.val() || {};
}

// ---------- PROMO ----------
route('POST', '/user/promo/apply', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        rateLimitOrThrow('promo:' + user.uid, 10, 60000);
        const code = asString(body(req).code, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) throw fail(400, 'CODE_REQUIRED', 'Promo code is required.');
        const snap = await db().ref('promo_codes/' + code.toLowerCase()).once('value');
        const promo = snap.val();
        if (!promo || promo.status !== 'active') throw fail(400, 'INVALID_CODE', 'Invalid or inactive promo code.');
        const now = Date.now();
        if (promo.startDate && now < promo.startDate) throw fail(400, 'NOT_STARTED', 'This promo has not started yet.');
        if (promo.expiryDate && now > promo.expiryDate) throw fail(400, 'EXPIRED', 'This promo code has expired.');
        const usedByUser = await db().ref('promo_usage/' + code.toLowerCase() + '/' + user.uid).once('value');
        if (usedByUser.exists()) throw fail(409, 'ALREADY_USED', 'You already used this promo code.');
        if (promo.perUserLimit && (usedByUser.numChildren ? usedByUser.numChildren() : 0) >= promo.perUserLimit) {
            throw fail(409, 'USAGE_LIMIT', 'Promo usage limit reached for your account.');
        }
        const usageCount = promo.usedCount || 0;
        if (promo.usageLimit && usageCount >= promo.usageLimit) throw fail(409, 'PROMO_EXHAUSTED', 'This promo code has been fully used.');
        const reward = promo.rewardType === 'percent'
            ? Math.max(0, Math.round(promo.reward)) // percent-based → needs a deposit; flat fallback
            : Number(promo.reward) || 0;
        if (reward <= 0) throw fail(400, 'INVALID_REWARD', 'Promo reward not configured.');
        const result = await applyWalletChange(user.uid, {
            bucket: 'deposit',
            amount: reward,
            type: 'Promo Bonus',
            method: 'Promo',
            refId: 'PROMO_' + code.toLowerCase() + '_' + user.uid,
            reason: 'Promo code ' + code,
            meta: { code }
        });
        await db().ref('promo_usage/' + code.toLowerCase() + '/' + user.uid).set(now);
        await db().ref('promo_codes/' + code.toLowerCase() + '/usedCount').set(usageCount + 1);
        return ok(res, { bonus: reward, newBalance: result.newBalance });
    } catch (e) { return handleError(res, e); }
});

// Unauthenticated promo lookup for the register screen. Honest server answer:
// never credits anything; the User App uses this instead of client-side maps.
route('POST', '/user/promo/check', async (req, res) => {
    try {
        rateLimitOrThrow('promo_check:' + (req.ip || req.headers['x-forwarded-for'] || 'g'), 20, 60000);
        const code = asString(body(req).code, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) return ok(res, { valid: false, reason: 'CODE_REQUIRED' });
        const snap = await db().ref('promo_codes/' + code.toLowerCase()).once('value');
        const promo = snap.val();
        if (!promo || promo.status !== 'active') return ok(res, { valid: false, reason: 'INVALID_CODE' });
        const now = Date.now();
        if (promo.startDate && now < promo.startDate) return ok(res, { valid: false, reason: 'NOT_STARTED' });
        if (promo.expiryDate && now > promo.expiryDate) return ok(res, { valid: false, reason: 'EXPIRED' });
        const usageCount = promo.usedCount || 0;
        if (promo.usageLimit && usageCount >= promo.usageLimit) return ok(res, { valid: false, reason: 'PROMO_EXHAUSTED' });
        return ok(res, {
            valid: true,
            code: promo.code,
            reward: promo.rewardType === 'percent' ? Math.max(0, Math.round(promo.reward)) : Number(promo.reward) || 0,
            rewardType: promo.rewardType,
            minDeposit: promo.minDeposit || 0,
            perUserLimit: promo.perUserLimit || 1
        });
    } catch (e) { return handleError(res, e); }
});

// ---------- DEPOSITS ----------
async function generateDepositId() {
    const ref = db().ref('system/deposit_seq');
    let n = 0;
    await ref.transaction((cur) => { n = (Number(cur) || 0) + 1; return n; });
    return 'DEP' + String(n).padStart(6, '0');
}

route('POST', '/user/deposits', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        rateLimitOrThrow('deposit:' + user.uid, 10, 60000);
        const settings = await getSettings();
        if (settings.deposits_enabled === false) throw fail(403, 'DEPOSITS_DISABLED', 'Deposits are currently disabled.');
        const b = body(req);
        const method = asString(b.paymentMethod, 20).toLowerCase();
        if (!['bkash', 'nagad', 'rocket', 'bank', 'other'].includes(method)) throw fail(400, 'INVALID_METHOD', 'Unsupported payment method.');
        const trxId = asString(b.trxId, 64).toUpperCase();
        if (!/^[A-Z0-9._:\-]{4,64}$/.test(trxId)) throw fail(400, 'INVALID_TRANSACTION_ID', 'Please provide a valid transaction ID.');
        const dup = await db().ref('deposit_txids/' + method + '/' + trxId).once('value');
        if (dup.exists()) throw fail(409, 'DUPLICATE_TRANSACTION', 'This transaction ID has already been submitted. Please wait for verification.');

        const userId = user.uid;
        const id = await generateDepositId();
        const deposit = {
            id,
            userId,
            paymentMethod: method,
            trxId,
            amount: null,          // decided by backend after SMS verification
            status: 'PENDING',
            verificationMode: null,
            matchResult: null,
            smsTxId: null,
            smsAmount: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        const writes = {};
        writes['deposits/' + id] = deposit;
        writes['deposit_txids/' + method + '/' + trxId] = id;
        writes['users/' + userId + '/last_deposit'] = Date.now();
        await db().ref().update(writes);
        return ok(res, { depositId: id, status: 'PENDING' });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/user/deposits', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        const snap = await db().ref('deposits').orderByChild('userId').equalTo(user.uid).limitToLast(100).once('value');
        const items = [];
        if (snap.exists()) snap.forEach(c => items.push({ id: c.key, ...c.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return ok(res, { deposits: items });
    } catch (e) { return handleError(res, e); }
});

// ---------- WITHDRAWALS ----------
async function generateWithdrawalId() {
    const ref = db().ref('system/withdrawal_seq');
    let n = 0;
    await ref.transaction((cur) => { n = (Number(cur) || 0) + 1; return n; });
    return 'WDR' + String(n).padStart(6, '0');
}

route('POST', '/user/withdrawals', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        rateLimitOrThrow('withdraw:' + user.uid, 10, 60000);
        const settings = await getSettings();
        if (settings.withdrawals_enabled === false) throw fail(403, 'WITHDRAWALS_DISABLED', 'Withdrawals are currently disabled.');
        const b = body(req);
        const method = asString(b.method, 20).toLowerCase();
        if (!['bkash', 'nagad', 'rocket', 'bank', 'other'].includes(method)) throw fail(400, 'INVALID_METHOD', 'Unsupported payment method.');
        const number = asString(b.number, 30);
        if (!/^[0-9+\-\s]{8,20}$/.test(number)) throw fail(400, 'INVALID_NUMBER', 'Please provide a valid mobile number.');
        const amount = matchPositiveMoney(b.amount);
        const min = settings.minimum_withdrawal || 100;
        if (amount < min) throw fail(400, 'BELOW_MINIMUM', 'Amount is below the minimum withdrawal limit.');
        if (settings.maximum_withdrawal && amount > settings.maximum_withdrawal) {
            throw fail(400, 'ABOVE_MAXIMUM', 'Amount exceeds the maximum withdrawal limit.');
        }
        const userSnap = await db().ref('users/' + user.uid).once('value');
        const wallet = userSnap.val() || {};
        const winning = Number(wallet.winning) || 0;
        if (winning < amount) throw fail(400, 'INSUFFICIENT_BALANCE', 'Insufficient winning balance.');

        const id = await generateWithdrawalId();
        await applyWalletChange(user.uid, {
            bucket: 'winning',
            amount: -amount,
            type: 'Withdrawal',
            method: 'Admin',
            refId: 'WDL_' + id,
            reason: 'Withdrawal request ' + id
        });
        const withdrawal = {
            id, userId: user.uid, method, number, amount,
            status: 'PENDING', providerRef: null,
            createdAt: Date.now(), updatedAt: Date.now()
        };
        await db().ref('withdrawals/' + id).set(withdrawal);
        return ok(res, { withdrawalId: id, status: 'PENDING' });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/user/withdrawals', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        const snap = await db().ref('withdrawals').orderByChild('userId').equalTo(user.uid).limitToLast(100).once('value');
        const items = [];
        if (snap.exists()) snap.forEach(c => items.push({ id: c.key, ...c.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return ok(res, { withdrawals: items });
    } catch (e) { return handleError(res, e); }
});

// ---------- MATCH JOIN ----------
// Server-authoritative: capacity, wallet, duplicate join, entry deduction.
function slotsFor(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('squad')) return 4;
    if (t.includes('duo')) return 2;
    return 1;
}

async function getMatchByKey(key) {
    const snap = await db().ref('matches/' + key).once('value');
    return snap.exists() ? { dbKey: key, ...snap.val() } : null;
}

route('POST', '/user/matches/join', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        rateLimitOrThrow('join:' + user.uid, 20, 60000);
        const b = body(req);
        const matchKey = asString(b.matchKey, 100);
        const match = await getMatchByKey(matchKey);
        if (!match) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        if (match.status !== 'Upcoming') throw fail(409, 'MATCH_NOT_JOINABLE', 'Match is not available for joining.');
        const slotCount = slotsFor(match.type);
        const players = Array.isArray(b.players) ? b.players.map(p => asString(p, 200)).filter(Boolean) : [];
        if (players.length !== slotCount) throw fail(400, 'PLAYER_COUNT_MISMATCH', 'Please provide all player names.');
        const feeEach = Number(match.entry) || 0;
        const totalFee = Math.round(feeEach * slotCount * 100) / 100;
        if (totalFee <= 0) throw fail(400, 'INVALID_ENTRY', 'This match has an invalid entry fee.');

        // Duplicate join prevention.
        const participantSnap = await db().ref('match_participants/' + match.id).once('value');
        let alreadyJoined = false;
        if (participantSnap.exists()) {
            participantSnap.forEach(child => { if ((child.val() || {}).joinedBy === user.uid) alreadyJoined = true; });
        }
        if (alreadyJoined) throw fail(409, 'ALREADY_JOINED', 'You have already joined this match.');

        // Capacity check (atomic against reserved+joined).
        const capRef = db().ref('matches/' + matchKey + '/joined');
        let joined = null;
        await capRef.transaction((cur) => {
            const before = Number(cur) || 0;
            if (before + slotCount > (Number(match.maxPlayers) || Number(match.total) || 0)) return undefined;
            joined = before + slotCount;
            return joined;
        });
        if (joined === null) throw fail(409, 'CAPACITY_FULL', 'Match is full.');

        // Wallet: balance = deposit + winning (backward-compatible UI promise).
        const userSnap = await db().ref('users/' + user.uid).once('value');
        const w = userSnap.val() || {};
        const depositBal = Number(w.deposit) || 0;
        const winningBal = Number(w.winning) || 0;
        if (depositBal + winningBal < totalFee) {
            await capRef.set(Math.max(0, joined - slotCount));
            throw fail(400, 'INSUFFICIENT_BALANCE', 'Insufficient balance.');
        }

        // Deduct fee: deposit bucket first, then winning bucket for the remainder.
        const fromDeposit = Math.min(depositBal, totalFee);
        const fromWinning = totalFee - fromDeposit;
        let depositRefTxn = null;
        let winningRefTxn = null;
        try {
            if (fromDeposit > 0) {
                const r = await applyWalletChange(user.uid, {
                    bucket: 'deposit', amount: -fromDeposit,
                    type: 'Match Entry', method: 'Match',
                    refId: 'JOIN_' + matchKey + '_' + user.uid + '_D',
                    reason: 'Entry fee ' + match.title, meta: { matchKey }
                });
                depositRefTxn = r;
            }
            if (fromWinning > 0) {
                const r = await applyWalletChange(user.uid, {
                    bucket: 'winning', amount: -fromWinning,
                    type: 'Match Entry', method: 'Match',
                    refId: 'JOIN_' + matchKey + '_' + user.uid + '_W',
                    reason: 'Entry fee ' + match.title, meta: { matchKey }
                });
                winningRefTxn = r;
            }
        } catch (e) {
            // Compensation: refund whatever was already deducted.
            await capRef.transaction((cur) => Math.max(0, (Number(cur) || 0) - slotCount));
            if (depositRefTxn) await applyWalletChange(user.uid, { bucket: 'deposit', amount: fromDeposit, type: 'Match Refund', method: 'Match', refId: 'JOIN_REF_' + matchKey + '_' + user.uid + '_D', reason: 'Rollback' }).catch(() => {});
            if (winningRefTxn) await applyWalletChange(user.uid, { bucket: 'winning', amount: fromWinning, type: 'Match Refund', method: 'Match', refId: 'JOIN_REF_' + matchKey + '_' + user.uid + '_W', reason: 'Rollback' }).catch(() => {});
            throw e;
        }

        // Create participant slots.
        const partRef = db().ref('match_participants/' + match.id).push();
        await partRef.set({
            matched: match.id,
            joinedBy: user.uid,
            joinedName: user.displayName || w.username || 'User',
            names: players,
            slots: slotCount,
            feePaid: totalFee,
            fromDeposit: fromDeposit,
            fromWinning: fromWinning,
            joinedAt: Date.now()
        });

        // User-facing joined list (kept in sync with the app's participant listener).
        await db().ref('users/' + user.uid + '/joined_matches/' + match.id).set({ matchKey, joinedAt: Date.now() });

        return ok(res, { success: true, matchId: match.id, joined, feePaid: totalFee });
    } catch (e) { return handleError(res, e); }
});

module.exports = { slotsFor, getMatchByKey };