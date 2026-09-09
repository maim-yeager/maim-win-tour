const { route } = require('../_lib/router');
const { ok, handleError } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');

// Dashboard analytics — always real backend data. Empty DB → honest zeros.
route('GET', '/admin/analytics/dashboard', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'analytics.view');
        const [usersSnap, depSnap, wdSnap, matchSnap, smsSnap, auditSnap, devicesSnap] = await Promise.all([
            db().ref('users').once('value'),
            db().ref('deposits').limitToLast(1000).once('value'),
            db().ref('withdrawals').limitToLast(1000).once('value'),
            db().ref('matches').limitToLast(2000).once('value'),
            db().ref('sms_transactions').limitToLast(2000).once('value'),
            db().ref('audit_logs').limitToLast(500).once('value'),
            db().ref('admin_devices').once('value')
        ]);
        const data = { users: {}, finance: {}, matches: {}, automation: {}, security: {} };

        let totalUsers = 0, newUsers24 = 0, activeUsers = 0, suspendedUsers = 0;
        usersSnap.forEach(c => {
            const u = c.val() || {};
            totalUsers++;
            if (u.status === 'suspended') suspendedUsers++;
            else activeUsers++;
            if ((u.createdAt || 0) >= Date.now() - 86400000) newUsers24++;
        });
        data.users = { totalUsers, newUsers24, activeUsers, suspendedUsers };

        let pendingDeposits = 0, totalDeposits = 0, depositAmount = 0;
        let pendingWithdrawals = 0, totalWithdrawals = 0, withdrawalAmount = 0;
        depSnap.forEach(c => {
            const d = c.val() || {};
            if (d.status === 'PENDING') pendingDeposits++;
            if (d.status === 'APPROVED') { totalDeposits++; depositAmount += Number(d.approvedAmount || 0); }
        });
        wdSnap.forEach(c => {
            const w = c.val() || {};
            if (w.status === 'PENDING') pendingWithdrawals++;
            if (w.status === 'COMPLETED') { totalWithdrawals++; withdrawalAmount += Number(w.amount || 0); }
        });
        data.finance = { pendingDeposits, totalDeposits, depositAmount, pendingWithdrawals, totalWithdrawals, withdrawalAmount };

        let activeMatches = 0, upcomingMatches = 0, completedMatches = 0, participants = 0;
        matchSnap.forEach(c => {
            const m = c.val() || {};
            if (m.status === 'Ongoing') activeMatches++;
            if (m.status === 'Upcoming') upcomingMatches++;
            if (m.status === 'Finished') completedMatches++;
            participants += Number(m.joined || 0);
        });
        data.matches = { activeMatches, upcomingMatches, completedMatches, participants };

        let detected = 0, autoApproved = 0, manualReview = 0, failures = 0;
        smsSnap.forEach(c => {
            const t = c.val() || {};
            detected++;
            if (t.result === 'APPROVED') autoApproved++;
            if (t.matchResult === 'MANUAL_REVIEW' || t.manualReview) manualReview++;
            if (t.result === 'FAILED') failures++;
        });
        data.automation = { detected, autoApproved, manualReview, failures };

        let failedLogins = 0, auditCount = 0;
        auditSnap.forEach(c => {
            auditCount++;
            if ((c.val() || {}).action === 'FAILED_LOGIN') failedLogins++;
        });
        let connectedDevices = 0;
        devicesSnap.forEach(c => { if ((c.val() || {}).status === 'CONNECTED') connectedDevices++; });
        data.security = { failedLogins, recentActivity: auditCount, connectedDevices };

        return ok(res, data);
    } catch (e) { return handleError(res, e); }
});

module.exports = {};