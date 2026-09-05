const { db } = require('./firebase');

// Immutable audit event for every important operation.
async function auditLog({ admin, device, action, targetType, targetId, refId, reason, result, requestId }) {
    const logRef = db().ref('audit_logs').push();
    const entry = {
        adminId: (admin && admin.id) || (device && device.adminId) || null,
        role: (admin && admin.role) || (device && device.role) || null,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        refId: refId || null,
        reason: reason || null,
        result: result || 'SUCCESS',
        requestId: requestId || null,
        deviceId: (device && device.id) || (admin && admin.session && admin.session.device) ? null : null,
        timestamp: Date.now()
    };
    if (entry.deviceId === null && admin && admin.session && admin.session.deviceId) {
        entry.deviceId = admin.session.deviceId;
    }
    await logRef.set(entry);
    return logRef.key;
}

// Store only the last N audit entries per node to bound growth? Not here —
// we provide pagination + deletes are not permitted by normal admins (rules enforce).

module.exports = { auditLog };