const { route } = require('../_lib/router');
const { ok, handleError } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, authenticateUser, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');

// =====================================================================
// LEADERBOARD — ranks players by lifetime match-prize earnings (lb_earnings)
// and match wins (lb_wins). Both fields are maintained atomically in
// matches.routes.js whenever a match is finalized and a prize is paid out.
// Same in-memory scan pattern already used by /admin/users (limitToLast +
// filter) — fine at this app's scale, avoids a second indexed data shape.
// =====================================================================

async function loadRanked(cap) {
    const snap = await db().ref('users').limitToLast(cap).once('value');
    const items = [];
    if (snap.exists()) {
        snap.forEach(child => {
            const v = child.val() || {};
            const earnings = Number(v.lb_earnings) || 0;
            const wins = Number(v.lb_wins) || 0;
            if (earnings <= 0 && wins <= 0) return; // skip players with no leaderboard activity
            items.push({
                uid: child.key,
                username: v.username || v.displayName || v.name || 'Player',
                earnings: Math.round(earnings * 100) / 100,
                wins
            });
        });
    }
    items.sort((a, b) => (b.earnings - a.earnings) || (b.wins - a.wins));
    items.forEach((it, i) => { it.rank = i + 1; });
    return items;
}

// ---------- USER APP: public (but authenticated) leaderboard ----------
// Returns the top N players, the caller's own rank (even if outside the
// top N), and — when ?q= is given — any players whose name matches.
route('GET', '/leaderboard', async (req, res) => {
    try {
        const user = await authenticateUser(req);
        const limit = Math.min(asInt(req.query.limit, 50) || 50, 100);
        const q = asString(req.query.q, 60).trim().toLowerCase();

        const ranked = await loadRanked(2000);
        const top = ranked.slice(0, limit);
        const me = ranked.find(p => p.uid === user.uid) || null;

        const result = { top, me, totalRanked: ranked.length };
        if (q) {
            result.matches = ranked.filter(p => (p.username || '').toLowerCase().includes(q)).slice(0, 20);
        }
        return ok(res, result);
    } catch (e) { return handleError(res, e); }
});

// ---------- ADMIN PANEL: top players ----------
route('GET', '/admin/leaderboard', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'users.view');
        const limit = Math.min(asInt(req.query.limit, 100) || 100, 300);
        const q = asString(req.query.q, 60).trim().toLowerCase();

        const ranked = await loadRanked(3000);
        let items = ranked;
        if (q) items = ranked.filter(p => (p.username || '').toLowerCase().includes(q) || p.uid.toLowerCase().includes(q));
        return ok(res, { top: items.slice(0, limit), totalRanked: ranked.length });
    } catch (e) { return handleError(res, e); }
});

module.exports = {};
