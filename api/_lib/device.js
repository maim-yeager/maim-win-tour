const { db } = require('./firebase');
const { fail } = require('./respond');
const { hashToken } = require('./auth');

// Each Admin APK installation registers with the backend and gets a
// device auth token. The APK can only ever report detected SMS payments;
// it never decides financial outcomes.

async function registerDevice(admin, deviceInfo) {
    const deviceId = (deviceInfo && deviceInfo.deviceId) || ('dev_' + Math.random().toString(36).slice(2) + Date.now());
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const existing = await db().ref('admin_devices/' + deviceId).once('value');
    await db().ref('admin_devices/' + deviceId).set({
        adminId: admin.id,
        deviceName: (deviceInfo && deviceInfo.deviceName) || 'Admin Device',
        model: (deviceInfo && deviceInfo.model) || null,
        appVersion: (deviceInfo && deviceInfo.appVersion) || null,
        status: existing.exists() && existing.val().status === 'REVOKED' ? 'CONNECTED' : 'CONNECTED',
        tokenHash: hashToken(token),
        tokenStatus: 'ACTIVE',
        lastSeen: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    return { deviceId, token, adminId: admin.id, status: 'CONNECTED' };
}

async function getDeviceById(deviceId) {
    const snap = await db().ref('admin_devices/' + deviceId).once('value');
    return snap.val() ? { ...snap.val(), id: deviceId } : null;
}

// Authenticate an APK device via Bearer device-token + X-Device-Id header.
async function authenticateDevice(req) {
    const header = req.headers['authorization'] || '';
    const deviceId = req.headers['x-device-id'];
    if (!header.startsWith('Bearer ') || !deviceId) throw fail(401, 'DEVICE_UNAUTHORIZED', 'Device authentication failed.');
    const token = header.slice(7).trim();
    const device = await getDeviceById(deviceId);
    if (!device) throw fail(401, 'DEVICE_UNAUTHORIZED', 'Device authentication failed.');
    if (!device.tokenHash || device.tokenHash !== hashToken(token)) throw fail(401, 'DEVICE_UNAUTHORIZED', 'Device authentication failed.');
    if (device.status === 'REVOKED') throw fail(403, 'DEVICE_REVOKED', 'This device has been revoked.');
    if (device.status === 'DISABLED') throw fail(403, 'DEVICE_DISABLED', 'This device is disabled.');
    if (device.tokenStatus !== 'ACTIVE') throw fail(403, 'DEVICE_UNAUTHORIZED', 'Device token is not active.');
    const { getAdminById } = require('./auth');
    const admin = await getAdminById(device.adminId);
    if (!admin) throw fail(401, 'ADMIN_NOT_FOUND', 'Admin account not found.');
    if (admin.status === 'DISABLED') throw fail(403, 'ACCOUNT_DISABLED', 'This admin account is disabled.');
    if (!admin.permissions || admin.permissions['sms.verify'] !== true) {
        if (admin.role !== 'OWNER') throw fail(403, 'FORBIDDEN', 'This device permission is not granted.');
    }
    await db().ref('admin_devices/' + device.id).update({ lastSeen: Date.now() });
    return { device, admin };
}

async function setDeviceStatus(deviceId, status) {
    await db().ref('admin_devices/' + deviceId).update({ status, updatedAt: Date.now() });
}

module.exports = { registerDevice, authenticateDevice, getDeviceById, setDeviceStatus };