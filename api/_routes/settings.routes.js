const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requireRole, requirePerm } = require('../_lib/auth');
const { asString, asNumber, asInt, asBool } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

route('GET', '/admin/settings', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'settings.view');
        const snap = await db().ref('app_settings').once('value');
        return ok(res, { settings: snap.val() || {} });
    } catch (e) { return handleError(res, e); }
});

// Whitelist server settings. Nothing here may include payment secrets.
function cleanSettings(b) {
    return {
        app_name: asString(b.app_name, 120),
        announcement: asString(b.announcement, 2000),
        notice: asString(b.notice, 1000),
        popupNotice: b.popupNotice && typeof b.popupNotice === 'object' ? {
            title: asString(b.popupNotice.title, 200),
            body: asString(b.popupNotice.body, 4000),
            enabled: asBool(b.popupNotice.enabled)
        } : null,
        maintenance_mode: asBool(b.maintenance_mode),
        registration_enabled: asBool(b.registration_enabled),
        deposits_enabled: asBool(b.deposits_enabled),
        withdrawals_enabled: asBool(b.withdrawals_enabled),
        minimum_deposit: asNumber(b.minimum_deposit, 0),
        maximum_deposit: asNumber(b.maximum_deposit, 0),
        minimum_withdrawal: asNumber(b.minimum_withdrawal, 0),
        maximum_withdrawal: asNumber(b.maximum_withdrawal, 0),
        referral_bonus: asNumber(b.referral_bonus, 0),
        referred_bonus: asNumber(b.referred_bonus, 0),
        support_link: asString(b.support_link, 1000),
        support_number: asString(b.support_number, 60),
        bkash_number: asString(b.bkash_number, 60),
        nagad_number: asString(b.nagad_number, 60),
        rocket_number: asString(b.rocket_number, 60),
        how_to_add_money_link: asString(b.how_to_add_money_link, 1000),
        how_to_play_link: asString(b.how_to_play_link, 1000),
        how_to_get_room_id_link: asString(b.how_to_get_room_id_link, 1000),
        video_links: b.video_links && typeof b.video_links === 'object' ? {
            addMoney: asString(b.video_links.addMoney, 1000),
            howPlay: asString(b.video_links.howPlay, 1000),
            getRoom: asString(b.video_links.getRoom, 1000)
        } : null,
        auto_verification_enabled: asBool(b.auto_verification_enabled),
        payment_methods: Array.isArray(b.payment_methods)
            ? b.payment_methods.map(m => ({ code: asString(m.code, 30), name: asString(m.name, 60), enabled: asBool(m.enabled) })).slice(0, 20)
            : null
    };
}

route('PUT', '/admin/settings', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        requirePerm(admin, 'settings.manage');
        const cleaned = cleanSettings(body(req));
        await db().ref('app_settings').update(Object.assign({}, cleaned, { updatedBy: admin.id, updatedAt: Date.now() }));
        await auditLog({ admin, action: 'SETTINGS_UPDATED', targetType: 'SETTINGS' });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/settings/maintenance', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requireRole(admin, 'SUPER_ADMIN');
        const enabled = asBool(body(req).enabled);
        await db().ref('app_settings').update({ maintenance_mode: enabled, updatedBy: admin.id, updatedAt: Date.now() });
        await auditLog({ admin, action: enabled ? 'MAINTENANCE_ENABLED' : 'MAINTENANCE_DISABLED', targetType: 'SETTINGS' });
        return ok(res, { enabled });
    } catch (e) { return handleError(res, e); }
});

module.exports = { cleanSettings };