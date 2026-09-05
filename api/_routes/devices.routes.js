const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');
const { registerDevice } = require('../_lib/device');
const { hashToken } = require('../_lib/auth');

// Register this ADMIN APK installation with the backend.
route('POST', '/admin/devices/register', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        if ((!admin.permissions || !admin.permissions['sms.verify']) && admin.role !== 'OWNER') {
            throw fail(403, 'FORBIDDEN', 'This admin is not granted SMS verification permission.');
        }
        const reg = await registerDevice(admin, {
            deviceId: asString(body(req).deviceId, 120),
            deviceName: asString(body(req).deviceName, 120),
            model: asString(body(req).model, 200),
            appVersion: asString(body(req).appVersion, 40)
        });
        await auditLog({ admin, action: 'DEVICE_REGISTERED', targetType: 'DEVICE', targetId: reg.deviceId });
        return ok(res, reg);
    } catch (e) { return handleError(res, e); }
});

route('GET', '/admin/devices', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'devices.view');
        const snap = await db().ref('admin_devices').once('value');
        const items = [];
        if (snap.exists()) snap.forEach(c => items.push({ id: c.key, ...c.val() }));
        return ok(res, { devices: items });
    } catch (e) { return handleError(res, e); }
});

function stripToken(dev) {
    const d = { ...dev };
    delete d.tokenHash;
    return d;
}

route('GET', '/admin/devices/:id', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'devices.view');
        const snap = await db().ref('admin_devices/' + req.params.id).once('value');
        if (!snap.exists()) throw fail(404, 'DEVICE_NOT_FOUND', 'Device not found.');
        return ok(res, { device: stripToken({ id: req.params.id, ...snap.val() }) });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/devices/:id/status', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'devices.manage');
        const id = asString(req.params.id, 120);
        const status = asString(body(req).status, 20).toUpperCase();
        if (!['CONNECTED', 'DISABLED', 'REVOKED'].includes(status)) throw fail(400, 'INVALID_STATUS', 'Invalid device status.');
        await db().ref('admin_devices/' + id).update({ status, updatedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: 'DEVICE_' + status, targetType: 'DEVICE', targetId: id });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/devices/:id/revoke', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'devices.manage');
        const id = asString(req.params.id, 120);
        await db().ref('admin_devices/' + id).update({ status: 'REVOKED', tokenStatus: 'REVOKED', updatedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: 'DEVICE_REVOKED', targetType: 'DEVICE', targetId: id });
        return ok(res, { revoked: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { stripToken };