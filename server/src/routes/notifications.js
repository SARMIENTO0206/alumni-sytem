import { Router } from 'express';
import { db } from '../db.js';
import { isAdmin, isAlumni, isStaff, ownsLinkedRow } from '../auth.js';
import { dispatchNotification, mapNotification, notificationTarget } from '../notify.js';

const router = Router();

function canSeeNotification(user, row) {
  if (!row) return false;
  if (isAdmin(user) || isStaff(user)) return true;
  return Number(row.user_id) === Number(user.id);
}

function unreadCountFor(user) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND COALESCE(is_read, 0) = 0'
  ).get(user.id)?.n || 0;
}

function relatedAccess(user, relatedType, relatedId) {
  const type = String(relatedType || '').toLowerCase();
  const id = Number(relatedId) || 0;
  if (!type || !id) return { ok: true, missing: true };
  if (type === 'transcript') {
    const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
    if (!row) return { ok: true, missing: true };
    return { ok: ownsLinkedRow(user, row), missing: false };
  }
  if (type === 'reprint') {
    const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
    if (!row) return { ok: true, missing: true };
    return { ok: ownsLinkedRow(user, row), missing: false };
  }
  if (type === 'payment') {
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!row) return { ok: true, missing: true };
    if (isAdmin(user) || isStaff(user)) return { ok: true, missing: false };
    return { ok: Number(row.user_id) === Number(user.id), missing: false };
  }
  if (type === 'application') {
    const row = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
    if (!row) return { ok: true, missing: true };
    return { ok: ownsLinkedRow(user, row), missing: false };
  }
  if (['event', 'job', 'announcement', 'survey', 'feedback', 'system'].includes(type)) {
    return { ok: true, missing: false };
  }
  return { ok: true, missing: false };
}

function loadOwned(req, res) {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(req.params.id));
  if (!row) {
    res.status(404).json({ error: 'Notification not found.' });
    return null;
  }
  if (!canSeeNotification(req.user, row)) {
    res.status(403).json({ error: 'You can only open your own notifications.' });
    return null;
  }
  return row;
}

router.get('/unread-count', (req, res) => {
  res.json({ unreadCount: unreadCountFor(req.user) });
});

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 200);
  let rows;
  if (isAlumni(req.user)) {
    rows = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    ).all(req.user.id, limit);
  } else {
    rows = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit);
  }
  res.json({
    notifications: rows.map(mapNotification),
    unreadCount: unreadCountFor(req.user)
  });
});

router.post('/read-all', (req, res) => {
  db.prepare(
    "UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND COALESCE(is_read, 0) = 0"
  ).run(req.user.id);
  res.json({ ok: true, unreadCount: 0 });
});

router.get('/:id', (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const access = relatedAccess(req.user, row.related_type, row.related_id);
  const target = notificationTarget(row.related_type, row.related_id, {
    paid: row.related_type === 'payment'
      ? db.prepare('SELECT status FROM payments WHERE id = ?').get(Number(row.related_id))?.status === 'paid'
      : false
  });
  res.json({
    notification: mapNotification({ ...row, target_url: row.target_url || target.url }),
    canOpenRelated: access.ok,
    relatedMissing: access.missing,
    target
  });
});

router.post('/:id/open', (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  const access = relatedAccess(req.user, row.related_type, row.related_id);
  if (!access.ok) {
    return res.status(403).json({ error: 'You are not allowed to open the record linked to this notification.' });
  }
  db.prepare("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ?").run(row.id);
  const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(row.id);
  let paid = false;
  if (row.related_type === 'payment' && row.related_id) {
    paid = db.prepare('SELECT status FROM payments WHERE id = ?').get(Number(row.related_id))?.status === 'paid';
  }
  const target = notificationTarget(row.related_type, row.related_id, { paid });
  res.json({
    notification: mapNotification(updated),
    target: access.missing ? { view: 'notifications', url: `/#/notifications/${row.id}` } : target,
    relatedMissing: access.missing,
    unreadCount: unreadCountFor(req.user)
  });
});

router.post('/:id/read', (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  db.prepare("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ?").run(row.id);
  res.json({
    notification: mapNotification(db.prepare('SELECT * FROM notifications WHERE id = ?').get(row.id)),
    unreadCount: unreadCountFor(req.user)
  });
});

router.post('/:id/unread', (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  db.prepare("UPDATE notifications SET is_read = 0, read_at = '' WHERE id = ?").run(row.id);
  res.json({
    notification: mapNotification(db.prepare('SELECT * FROM notifications WHERE id = ?').get(row.id)),
    unreadCount: unreadCountFor(req.user)
  });
});

router.delete('/:id', (req, res) => {
  const row = loadOwned(req, res);
  if (!row) return;
  db.prepare('DELETE FROM notifications WHERE id = ?').run(row.id);
  res.json({ ok: true, unreadCount: unreadCountFor(req.user) });
});

router.post('/', async (req, res) => {
  if (!isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'Only staff or the system administrator can send messages.' });
  }
  const { channel, recipient, subject, message, relatedType, relatedId } = req.body || {};
  if (!channel || !recipient || !subject) {
    return res.status(400).json({ error: 'channel, recipient and subject are required.' });
  }
  const kind = String(channel).toUpperCase();
  if (!['EMAIL', 'SMS', 'SYSTEM'].includes(kind)) {
    return res.status(400).json({ error: 'channel must be EMAIL, SMS, or SYSTEM.' });
  }
  const matched = kind === 'EMAIL'
    ? db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(String(recipient).trim())
    : db.prepare('SELECT * FROM users WHERE contact = ? OR contact = ?').get(String(recipient).trim(), String(recipient).replace(/^0/, '+63'));

  const notification = await dispatchNotification({
    userId: matched?.id || 0,
    alumniId: matched?.alumni_id || 0,
    recipient,
    channel: kind,
    subject,
    message: message || '',
    relatedType: relatedType || 'system',
    relatedId: relatedId || '',
    email: kind === 'EMAIL' ? recipient : matched?.email,
    phone: kind === 'SMS' ? recipient : matched?.contact,
    sendEmail: kind === 'EMAIL',
    sendSms: kind === 'SMS'
  });

  const status = kind === 'EMAIL' ? notification?.emailStatus : (kind === 'SMS' ? notification?.smsStatus : 'recorded');
  res.status(201).json({
    notification,
    deliveryStatus: status || 'failed',
    unreadCount: unreadCountFor(req.user)
  });
});

export default router;
