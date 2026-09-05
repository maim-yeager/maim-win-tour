const { route } = require('../_lib/router');
const { ok, fail, handleError, body } = require('../_lib/respond');
const { db } = require('../_lib/firebase');
const { authenticateAdmin, requirePerm } = require('../_lib/auth');
const { asString, asInt, asBool } = require('../_lib/validate');
const { auditLog } = require('../_lib/audit');

function sanitizeCategory(id, cat) {
    return { categoryId: id, ...cat };
}

async function getCategory(id) {
    const snap = await db().ref('categories/' + id).once('value');
    return snap.exists() ? { id, ...snap.val() } : null;
}

// Clean a category payload against an allow-list. Never trust arbitrary fields.
function cleanCategory(b) {
    return {
        name: asString(b.name, 120) || null,
        code: asString(b.code, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_') || null,
        img: asString(b.img, 1000) || null,          // banner (backward compatible)
        bannerUrl: asString(b.bannerUrl || b.img, 1000) || null,
        icon: asString(b.icon, 1000) || null,
        iconUrl: asString(b.iconUrl || b.icon, 1000) || null,
        description: asString(b.description, 2000),
        displayOrder: asInt(b.displayOrder, 0),
        featured: asBool(b.featured),
        showOnHome: asBool(b.showOnHome),
        status: ['active', 'inactive'].includes(b.status) ? b.status : 'inactive'
    };
}

route('GET', '/admin/categories', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.view');
        const snap = await db().ref('categories').once('value');
        let items = [];
        if (snap.exists()) {
            snap.forEach(child => items.push(sanitizeCategory(child.key, child.val())));
        }
        items.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        return ok(res, { categories: items });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/categories', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.create');
        const cleaned = cleanCategory(body(req));
        if (!cleaned.name) throw fail(400, 'NAME_REQUIRED', 'Category name is required.');
        const ref = db().ref('categories').push();
        await ref.set(Object.assign({}, cleaned, {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: admin.id,
            updatedBy: admin.id
        }));
        await auditLog({ admin, action: 'CATEGORY_CREATED', targetType: 'CATEGORY', targetId: ref.key });
        return ok(res, { categoryId: ref.key });
    } catch (e) { return handleError(res, e); }
});

route('PUT', '/admin/categories/:categoryId', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.edit');
        const id = asString(req.params.categoryId, 100);
        const existing = await getCategory(id);
        if (!existing) throw fail(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
        const cleaned = cleanCategory(body(req));
        await db().ref('categories/' + id).update(Object.assign({}, cleaned, {
            updatedAt: Date.now(),
            updatedBy: admin.id
        }));
        await auditLog({ admin, action: 'CATEGORY_EDITED', targetType: 'CATEGORY', targetId: id });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/categories/:categoryId/status', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.edit');
        const id = asString(req.params.categoryId, 100);
        const status = body(req).status;
        if (!['active', 'inactive'].includes(status)) throw fail(400, 'INVALID_STATUS', 'Invalid status.');
        await db().ref('categories/' + id).update({ status, updatedAt: Date.now(), updatedBy: admin.id });
        await auditLog({ admin, action: status === 'active' ? 'CATEGORY_ENABLED' : 'CATEGORY_DISABLED', targetType: 'CATEGORY', targetId: id });
        return ok(res, { updated: true });
    } catch (e) { return handleError(res, e); }
});

route('POST', '/admin/categories/reorder', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.edit');
        const order = Array.isArray(body(req).order) ? body(req).order : [];
        const updates = {};
        order.slice(0, 100).forEach((id, idx) => {
            if (typeof id === 'string') updates[id + '/displayOrder'] = idx;
        });
        if (Object.keys(updates).length) await db().ref('categories').update(updates);
        await auditLog({ admin, action: 'CATEGORY_REORDERED', targetType: 'CATEGORY' });
        return ok(res, { reordered: true });
    } catch (e) { return handleError(res, e); }
});

route('DELETE', '/admin/categories/:categoryId', async (req, res) => {
    try {
        const admin = await authenticateAdmin(req);
        requirePerm(admin, 'categories.edit');
        const id = asString(req.params.categoryId, 100);
        const matchSnap = await db().ref('matches').orderByChild('categoryId').equalTo(id).limitToFirst(1).once('value');
        if (matchSnap.exists()) throw fail(409, 'CATEGORY_IN_USE', 'This category has matches. Disable it instead of deleting.');
        await db().ref('categories/' + id).remove();
        await auditLog({ admin, action: 'CATEGORY_DELETED', targetType: 'CATEGORY', targetId: id });
        return ok(res, { deleted: true });
    } catch (e) { return handleError(res, e); }
});

module.exports = { sanitizeCategory, getCategory };