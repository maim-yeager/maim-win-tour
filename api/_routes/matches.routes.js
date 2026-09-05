const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asNumber, asBool, matchPositiveMoney } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { applyWalletChange } = require('../_lib/ledger');

const MATCH_STATUS = ['Draft', 'Upcoming', 'Ongoing', 'Finished', 'Cancelled'];

function cleanMatch(b) {
    return {
        categoryId: asString(b.categoryId, 100) || null,
        title: asString(b.title || b.name, 200) || null,
        name: asString(b.title || b.name, 200) || null,
        icon: asString(b.icon || b.iconUrl, 1000) || null,
        iconUrl: asString(b.icon || b.iconUrl, 1000) || null,
        type: asString(b.type, 60) || 'Solo',
        entry: asNumber(b.entry, 0),
        entryFee: asNumber(b.entry || b.entryFee, 0),
        prizePool: asNumber(b.prizePool || b.total_prize, 0),
        total_prize: asNumber(b.prizePool || b.total_prize, 0),
        per_kill: asNumber(b.per_kill, 0),
        map: asString(b.map, 120),
        minPlayers: asInt(b.minPlayers, 1),
        total: asInt(b.total, 48),
        maxPlayers: asInt(b.maxPlayers || b.total, 48),
        time: asString(b.time, 80),
        date: asString(b.date, 80),
        timestamp: asInt(b.timestamp, 0),
        duration: asInt(b.duration, 0),
        room_id: asString(b.room_id, 120),
        room_pass: asString(b.room_pass, 120),
        description: asString(b.description, 2000),
        rules: asString(b.rules, 4000),
        prize_desc: asString(b.prize_desc, 4000),
        autoStart: asBool(b.autoStart),
        allowLateJoin: asBool(b.allowLateJoin),
        allowReentry: asBool(b.allowReentry),
        featured: asBool(b.featured),
        published: asBool(b.published),
        status: MATCH_STATUS.includes(b.status) ? b.status : 'Draft'
    };
}

// Allocate the next stable integer match id used by match_participants + user app.
async function nextMatchId() {
    const ref = db().ref('system/match_id_seq');
    let result = null;
    await ref.transaction((cur) => {
        const next = (Number(cur) || 0) + 1;
        result = next;
        return next;
    });
    return result;
}

async function getMatch(key) {
    const snap = await db().ref('matches/' + key).once('value');
    return snap.exists() ? { dbKey: key, ...snap.val() } : null;
}

route('GET', '/admin/matches', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.view');
        const cat = asString(req.query.categoryId, 100);
        const status = asString(req.query.status, 40);
        const q = asString(req.query.q, 120).toLowerCase();
        const snap = await db().ref('matches').limitToLast(500).once('value');
        let items = [];
        if (snap.exists()) snap.forEach(child => items.push({ dbKey: child.key, ...child.val() }));
        if (cat) items = items.filter(m => m.categoryId === cat);
        if (status) items = items.filter(m => m.status === status);
        if (q) items = items.filter(m =>
            ((m.title || '') + ' ' + (m.type || '') + ' ' + (m.map || '')).toLowerCase().includes(q));
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return ok(res, { matches: items });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/matches/:key', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.view');
        const m = await getMatch(req.params.key);
        if (!m) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        return ok(res, { match: m });
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/matches/:key/participants', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.view');
        const key = asString(req.params.key, 100);
        const m = await getMatch(key);
        if (!m) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        const partSnap = await db().ref('match_participants/' + m.id).once('value');
        const participants = [];
        if (partSnap.exists()) {
            partSnap.forEach(child => {
                const p = { participantId: child.key, ...child.val() };
                participants.push({ participantId: p.participantId, joinedBy: p.joinedBy, joinedName: p.joinedName, names: p.names || [], feePaid: p.feePaid });
            });
        }
        return ok(res, { participants });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/matches', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.create');
        const cleaned = cleanMatch(body(req));
        if (!cleaned.title) throw fail(400, 'TITLE_REQUIRED', 'Match title is required.');
        if (!cleaned.categoryId) throw fail(400, 'CATEGORY_REQUIRED', 'A category is required.');
        const id = await nextMatchId();
        const ref = db().ref('matches').push();
        const doc = Object.assign({}, cleaned, {
            id,
            joined: 0,
            winner: null,
            finalizedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: admin.id,
            updatedBy: admin.id
        });
        await ref.set(doc);
        await auditLog({ admin, action: 'MATCH_CREATED', targetType: 'MATCH', targetId: ref.key, refId: String(id) });
        return ok(res, { matchKey: ref.key, id });
    } catch (e) { return handleError(res, e); }
});

route('PUT', '/admin/matches/:key', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.edit');
        const key = asString(req.params.key, 100);
        const existing = await getMatch(key);
        if (!existing) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        if (existing.status === 'Finished') throw fail(409, 'MATCH_FINISHED', 'Finished matches cannot be edited.');
        const cleaned = cleanMatch(body(req));
        await db().ref('matches/' + key).update(Object.assign({}, cleaned, {
            updatedAt: Date.now(),
            updatedBy: admin.id
        }));
        await auditLog({ admin, action: 'MATCH_EDITED', targetType: 'MATCH', targetId: key });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/matches/:key/status', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.edit');
        const key = asString(req.params.key, 100);
        const status = asString(body(req).status, 40);
        if (!MATCH_STATUS.includes(status)) throw fail(400, 'INVALID_STATUS', 'Invalid match status.');
        const existing = await getMatch(key);
        if (!existing) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        const allowedTransitions = {
            Draft: ['Upcoming', 'Cancelled'],
            Upcoming: ['Ongoing', 'Finished', 'Cancelled'],
            Ongoing: ['Finished', 'Cancelled'],
            Finished: [],
            Cancelled: []
        };
        const allowed = allowedTransitions[existing.status] || [];
        if (!allowed.includes(status)) throw fail(409, 'INVALID_TRANSITION', 'Cannot transition match to ' + status + '.');
        await db().ref('matches/' + key).update({ status, updatedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: 'MATCH_STATUS_' + status.toUpperCase(), targetType: 'MATCH', targetId: key });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/matches/:key/cancel', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.cancel');
        const key = asString(req.params.key, 100);
        const existing = await getMatch(key);
        if (!existing) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        if (existing.status === 'Finished') throw fail(409, 'MATCH_FINISHED', 'A finished match cannot be cancelled.');
        const reason = asString(body(req).reason, 500) || 'Cancelled by admin';

        // Refund entry fees to all participants (atomic per user, idempotent by refId).
        const partSnap = await db().ref('match_participants/' + existing.id).once('value');
        let refunded = 0;
        const entries = [];
        if (partSnap.exists()) partSnap.forEach(child => entries.push(child.val()));
        const seen = new Set();
        const perSlot = Number(existing.entryFee || existing.entry || 0) || 0;
        for (const p of entries) {
            if (!p || !p.joinedBy || seen.has(p.joinedBy)) continue;
            seen.add(p.joinedBy);
            const paid = Number(p.feePaid) || 0;
            const slots = p.slots || 1;
            const amount = paid > 0 ? paid : (perSlot > 0 ? Math.round(perSlot * slots * 100) / 100 : 0);
            if (amount <= 0) continue;
            try {
                await applyWalletChange(p.joinedBy, {
                    bucket: 'deposit',
                    amount,
                    type: 'Match Refund',
                    method: 'Match',
                    refId: 'CANCEL_' + key + '_' + p.joinedBy,
                    reason,
                    meta: { matchKey: key }
                });
                refunded += amount;
            } catch (e) {
                // Already refunded previously (idempotency) or user gone — count only real refunds.
            }
        }

        await db().ref('matches/' + key).update({ status: 'Cancelled', updatedAt: Date.now(), updatedBy: admin.id, cancelReason: reason });
        await auditLog({ admin, action: 'MATCH_CANCELLED', targetType: 'MATCH', targetId: key, reason });
        return ok(res, { cancelled: true, refunded });
    } catch (e) { return handleError(res, e); }
});

// Finalize + distribute prize. placements: [{name, place, prize}] — prize decided by server policy
// and validated against the prize pool. Credits go to the joined user's winning bucket via ledger.
route('POST', '/admin/matches/:key/finalize', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.edit');
        const key = asString(req.params.key, 100);
        const existing = await getMatch(key);
        if (!existing) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        if (existing.status !== 'Ongoing' && existing.status !== 'Upcoming') {
            throw fail(409, 'INVALID_TRANSITION', 'Only ongoing/upcoming matches can be finalized.');
        }
        const b = body(req);
        const placements = Array.isArray(b.placements) ? b.placements : [];
        if (!placements.length) throw fail(400, 'PLACEMENTS_REQUIRED', 'Provide at least one placement.');

        const prizePool = existing.total_prize || existing.prizePool || 0;
        let allocated = 0;
        for (const pl of placements.slice(0, 1000)) {
            const prize = matchPositiveMoney(pl.prize);
            allocated += prize;
        }
        if (allocated > prizePool + 1) throw fail(400, 'PRIZE_OVERFLOW', 'Allocated prize exceeds the prize pool.');

        // Map participant → user. match_participants/{legacyId} uses the numeric match id.
        const partSnap = await db().ref('match_participants/' + existing.id).once('value');
        const participantList = [];
        const lookup = {};
        if (partSnap.exists()) {
            partSnap.forEach(child => {
                const p = { participantId: child.key, ...child.val() };
                participantList.push(p);
                if (p.joinedBy) lookup['uid:' + p.joinedBy] = p.joinedBy;
                if (p.joinedName) lookup[String(p.joinedName).toLowerCase()] = p.joinedBy;
                if (Array.isArray(p.names)) p.names.forEach(n => { if (n) lookup[String(n).toLowerCase()] = p.joinedBy; });
                if (p.name) lookup[String(p.name).toLowerCase()] = p.joinedBy;
            });
        }

        const payouts = [];
        for (const pl of placements) {
            const playerName = asString(pl.name, 200).toLowerCase();
            const prize = matchPositiveMoney(pl.prize);
            const place = asInt(pl.place, 0) || (payouts.length + 1);
            let uid = asString(pl.uid, 100) || null;
            if (!uid && playerName) uid = lookup[playerName] || null;
            if (!uid && pl.participantId) {
                const hit = participantList.find(x => x.participantId === pl.participantId);
                if (hit) uid = hit.joinedBy;
            }
            if (!uid) throw fail(400, 'PLAYER_NOT_FOUND', 'Could not resolve a participant for "' + (pl.name || '') + '".');
            const result = await applyWalletChange(uid, {
                bucket: 'winning',
                amount: prize,
                type: 'Match Prize',
                method: 'Match',
                refId: 'PRIZE_' + key + '_' + place,
                reason: 'Won ' + existing.title,
                meta: { matchKey: key, place }
            });
            payouts.push({ name: pl.name, place, prize, uid, balanceAfterPrize: result.newBalance });
        }

        const winnerText = placements.map((p) => `${p.place}: ${p.name} (৳${p.prize})`).join('\n');
        await db().ref('matches/' + key).update({ status: 'Finished', winner: winnerText, finalizedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: 'MATCH_FINALIZED', targetType: 'MATCH', targetId: key, reason: 'Prize distributed' });
        return ok(res, { finalized: true, payouts });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/matches/:key', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'matches.edit');
        const key = asString(req.params.key, 100);
        const existing = await getMatch(key);
        if (!existing) throw fail(404, 'MATCH_NOT_FOUND', 'Match not found.');
        if (existing.joined > 0) throw fail(409, 'MATCH_HAS_PLAYERS', 'Cannot delete a match with participants.');
        await db().ref('matches/' + key).remove();
        await auditLog({ admin, action: 'MATCH_DELETED', targetType: 'MATCH', targetId: key });
        return ok(res, { deleted: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { cleanMatch, getMatch, nextMatchId };