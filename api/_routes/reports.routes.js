const { route } = require('../_lib/router');
const { ok, fail, handleError } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asInt } = require('../_lib/validate');

const RANGES = { today: 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };
// Custom range handled via from/to ms.

function rangeBounds(fromMs, toMs) {
    const now = Date.now();
    const to = toMs || now;
    const from = fromMs || (now - RANGES['30d']);
    return { from, to };
}

route('GET', '/admin/reports/users', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'reports.view');
        const { from, to } = rangeBounds(asInt(req.query.from), asInt(req.query.to));
        const snap = await db().ref('users').once('value');
        const daily = {};
        let total = 0, newUsers = 0, deposited = 0, suspended = 0;
        if (snap.exists()) {
            snap.forEach(child => {
                const u = child.val() || {};
                total++;
                if (u.status === 'suspended') suspended++;
                const created = u.createdAt || (u.created && typeof u.created === 'object' ? (u.created.t || u.created['.value']) : 0) || 0;
                if (created >= from && created <= to) newUsers++;
                if (Number.isFinite(created) && created >= from && created <= to) {
                    const day = new Date(created).toISOString().slice(0, 10);
                    daily[day] = (daily[day] || 0) + 1;
                }
                if (Number(u.deposit) > 0 || Number(u.winning) > 0) deposited++;
            });
        }
        return ok(res, {
            range: { from, to },
            total, newUsers, activeUsers: total - suspended, suspended, depositedUsers: deposited,
            timeline: Object.keys(daily).sort().map(d => ({ date: d, count: daily[d] }))
        });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/reports/finance', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'reports.view');
        const { from, to } = rangeBounds(asInt(req.query.from), asInt(req.query.to));
        const [depSnap, wdSnap] = await Promise.all([
            db().ref('deposits').once('value'),
            db().ref('withdrawals').once('value')
        ]);
        const report = { totalDeposits: 0, approvedDeposits: 0, pendingDeposits: 0, rejectedDeposits: 0,
            depositAmount: 0, totalWithdrawals: 0, completedWithdrawals: 0, pendingWithdrawals: 0,
            withdrawalAmount: 0, payoutAmount: 0, depositsByMethod: {}, timeline: {} };
        depSnap.forEach(child => {
            const d = child.val() || {};
            if (!(d.createdAt >= from && d.createdAt <= to)) return;
            report.totalDeposits++;
            report.depositAmount += Number(d.approvedAmount || 0);
            report.depositsByMethod[d.paymentMethod || 'other'] = (report.depositsByMethod[d.paymentMethod || 'other'] || 0) + Number(d.approvedAmount || 0);
            if (d.status === 'APPROVED') report.approvedDeposits++;
            else if (d.status === 'PENDING' || d.status === 'MANUAL_REVIEW') report.pendingDeposits++;
            else if (d.status === 'REJECTED') report.rejectedDeposits++;
            const day = new Date(d.createdAt).toISOString().slice(0, 10);
            report.timeline[day] = report.timeline[day] || { approved: 0, amount: 0 };
            if (d.status === 'APPROVED') { report.timeline[day].approved++; report.timeline[day].amount += Number(d.approvedAmount || 0); }
        });
        wdSnap.forEach(child => {
            const w = child.val() || {};
            if (!(w.createdAt >= from && w.createdAt <= to)) return;
            report.totalWithdrawals++;
            report.withdrawalAmount += Number(w.amount || 0);
            if (w.status === 'COMPLETED') report.completedWithdrawals++;
            if (w.status === 'PENDING') report.pendingWithdrawals++;
        });
        return ok(res, {
            range: { from, to }, ...report,
            timeline: Object.keys(report.timeline).sort().map(d => ({ date: d, ...report.timeline[d] }))
        });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/reports/verification', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'reports.view');
        const { from, to } = rangeBounds(asInt(req.query.from), asInt(req.query.to));
        const snap = await db().ref('sms_transactions').limitToLast(5000).once('value');
        const count = { MATCHED: 0, AMOUNT_MISMATCH: 0, DUPLICATE_TRANSACTION: 0, UNMATCHED: 0, INVALID_TRANSACTION: 0, EXPIRED_DEPOSIT: 0, ALREADY_APPROVED: 0, ALREADY_REJECTED: 0, FAILED: 0, AUTO_APPROVED: 0, MANUAL_APPROVED: 0 };
        let detected = 0;
        if (snap.exists()) {
            snap.forEach(child => {
                const t = child.val() || {};
                if (!(t.createdAt >= from && t.createdAt <= to)) return;
                detected++;
                count[t.matchResult || 'UNMATCHED'] = (count[t.matchResult || 'UNMATCHED'] || 0) + 1;
                if (t.mode === 'AUTO' && t.result === 'APPROVED') count.AUTO_APPROVED++;
                if (t.mode === 'MANUAL' && t.result === 'APPROVED') count.MANUAL_APPROVED++;
            });
        }
        return ok(res, { range: { from, to }, detected, ...count });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/reports/matches', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'reports.view');
        const snap = await db().ref('matches').once('value');
        const report = { created: 0, upcoming: 0, ongoing: 0, finished: 0, cancelled: 0, totalParticipants: 0, totalEntries: 0, byCategory: {} };
        if (snap.exists()) {
            snap.forEach(child => {
                const m = child.val() || {};
                report.created++;
                report[m.status === 'Upcoming' ? 'upcoming' : m.status === 'Ongoing' ? 'ongoing' : m.status === 'Finished' ? 'finished' : 'cancelled']++;
                report.totalParticipants += Number(m.joined || 0);
                report.totalEntries += (Number(m.joined || 0) * Number(m.entry || 0));
                report.byCategory[m.categoryId || 'none'] = (report.byCategory[m.categoryId || 'none'] || 0) + 1;
            });
        }
        return ok(res, report);
    } catch (e) { return handleError(res, e); }
});

module.exports = {};