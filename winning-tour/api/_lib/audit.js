const { db } = require('./firebase');

// Immutable audit event for every important operation.
async function auditLog({ admin, device, action, targetType, targetId, refId, reason, result, requestId }) {
    const logRef = db().ref('audit_logs').push();
    // Previous code had a ternary-precedence bug: "...) ? null : null" always
    // evaluated to null, so deviceId was never recorded even when present.
    const session = admin && admin.session;
    const deviceId = (device && device.id) ||
        (session && (session.deviceId || (session.device && session.device.id))) ||
        null;
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
        deviceId,
        timestamp: Date.now()
    };
    await logRef.set(entry);
    return logRef.key;
}

// Store only the last N audit entries per node to bound growth? Not here —
// we provide pagination + deletes are not permitted by normal admins (rules enforce).

module.exports = { auditLog };