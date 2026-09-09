// Media Gallery Management Routes

const express = require('express');
const router = express.Router();

const { db, json, fail, needAuth, needRole, parseBody } = require('../_lib');

// GET /media - List all media items
router.get('/media', async (req, res) => {
  try {
    const snap = await db().ref('media_gallery').once('value');
    const items = [];
    if (snap.exists()) {
      snap.forEach(child => {
        items.push({
          id: child.key,
          ...child.val()
        });
      });
    }
    return res.json({ success: true, data: { items: items } });
  } catch (e) {
    return res.json({ success: false, error: { message: e.message } });
  }
});

// POST /media - Add media item (admin only)
router.post('/media', needAuth, needRole('ADMIN'), async (req, res) => {
  try {
    const b = parseBody(req);
    const url = String(b.url || '').trim();
    const label = String(b.label || 'Image').trim();
    
    if (!url.startsWith('http')) {
      return res.json({ success: false, error: { message: 'Invalid URL' } });
    }
    
    const key = db().ref('media_gallery').push().key;
    await db().ref('media_gallery/' + key).set({
      url: url,
      label: label,
      uploadedAt: db().ServerValue.TIMESTAMP,
      uploadedBy: req.admin.id
    });
    
    return res.json({ success: true, data: { id: key } });
  } catch (e) {
    return res.json({ success: false, error: { message: e.message } });
  }
});

// DELETE /media/:id - Delete media item (admin only)
router.delete('/media/:id', needAuth, needRole('ADMIN'), async (req, res) => {
  try {
    await db().ref('media_gallery/' + req.params.id).remove();
    return res.json({ success: true, data: {} });
  } catch (e) {
    return res.json({ success: false, error: { message: e.message } });
  }
});

module.exports = router;
module.exports.path = '/admin';
