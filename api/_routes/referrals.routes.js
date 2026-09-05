const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

route('GET', '/admin/referrals', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'referrals.view');
        const limit = Math.min(asInt(req.query.limit, 25) || 25, 100);
        const q = asString(req.query.q, 120).toLowerCase();
        const snap = await db().ref('referrals').limitToLast(2000).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ id: child.key, ...child.val() }));
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (q) items = items.filter(r =>
            (r.referrer || '').toLowerCase().includes(q) ||
            (r.referred || '').toLowerCase().includes(q) ||
            (r.id || '').toLowerCase().includes(q));
        const page = asInt(req.query.page, 1) || 1;
        const start = (page - 1) * limit;
        return ok(res, { items: items.slice(start, start + limit), total: items.length, page, limit });
    } catch (e) { return handleError(res, e); }
});

// Backend issues referral rewards when a referred user becomes active.
// Safe rules: no self-referral (validated at claim time), one reward per user,
// reward is transaction-safe via ledger refId.
route('POST', '/admin/referrals/claim', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'referrals.manage');
        const b = body(req);
        const refChild = db().ref('referrals/' + asString(b.id, 120));
        const snap = await refChild.once('value');
        if (!snap.exists()) throw fail(404, 'REFERRAL_NOT_FOUND', 'Referral not found.');
        const r = snap.val();
        if (r.rewarded === true) throw fail(409, 'ALREADY_REWARDED', 'This referral was already rewarded.');
        const { applyWalletChange } = require('../_lib/ledger');
        const reward = asInt(b.reward, 0) || asInt(r.reward, 0);
        if (reward <= 0) throw fail(400, 'INVALID_REWARD', 'Invalid reward amount.');
        if (r.referrer === r.referred) throw fail(400, 'SELF_REFERRAL', 'Self referral is not allowed.');
        await applyWalletChange(r.referrer, {
            bucket: 'deposit',
            amount: reward,
            type: 'Referral Reward',
            method: 'Referral',
            refId: 'REF_' + r.id,
            reason: 'Referral reward for ' + (r.referred || '')
        });
        await refChild.update({ rewarded: true, rewardedBy: admin.id, rewardedAt: Date.now() });
        await auditLog({ admin, action: 'REFERRAL_REWARDED', targetType: 'REFERRAL', targetId: r.id, refId: r.referred });
        return ok(res, { rewarded: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = {};