import { Router } from 'express';
import { db, writeAudit } from '../db.js';
import { isAdmin, isAlumni, isStaff, ownsLinkedRow, requireRole } from '../auth.js';
import { dispatchNotification, mapNotification, notificationTarget } from '../notify.js';
import { sendMail } from '../mail.js';
import { sendSms } from '../sms.js';

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
  const rows = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(req.user.id, limit);
  res.json({
    notifications: rows.map(mapNotification),
    unreadCount: unreadCountFor(req.user)
  });
});

router.get('/communications/recipients', requireRole('admin', 'staff'), (req, res) => {
  const recipients = db.prepare(`
    SELECT id, name, email, contact, batch, education_level
    FROM users
    WHERE role = 'alumni' AND (status IS NULL OR status = 'Active')
    ORDER BY name COLLATE NOCASE
  `).all();
  res.json({ recipients });
});

router.get('/communications/history', requireRole('admin', 'staff'), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = db.prepare(`
    SELECT id, user_id AS userId, recipient, subject AS title, status,
      'EMAIL' AS channel, created_at AS createdAt, reason AS detail
    FROM mail_logs
    UNION ALL
    SELECT id, user_id AS userId, recipient, message AS title, status,
      'SMS' AS channel, created_at AS createdAt, reason AS detail
    FROM sms_logs
    ORDER BY createdAt DESC
    LIMIT ?
  `).all(limit);
  res.json({ messages: rows });
});

router.post('/communications/send', requireRole('admin', 'staff'), async (req, res) => {
  const channel = String(req.body?.channel || '').toUpperCase();
  const recipientMode = String(req.body?.recipientMode || '');
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  let attachment;
  if (!['SMS', 'EMAIL'].includes(channel)) return res.status(400).json({ error: 'Choose SMS or Email.' });
  if (!['individual', 'all', 'selected'].includes(recipientMode)) {
    return res.status(400).json({ error: 'Choose an individual or alumni audience.' });
  }
  if (channel === 'SMS' && req.body?.attachment) {
    return res.status(400).json({ error: 'Attachments are only supported for Email.' });
  }
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (channel === 'SMS' && message.length > 160) return res.status(400).json({ error: 'SMS messages must be 160 characters or fewer.' });
  if (channel === 'EMAIL' && (!subject || subject.length > 200)) {
    return res.status(400).json({ error: 'A subject of 200 characters or fewer is required.' });
  }
  if (channel === 'EMAIL' && req.body?.attachment) {
    const input = req.body.attachment;
    if (input.contentType !== 'application/pdf' || typeof input.filename !== 'string' ||
        !input.filename.toLowerCase().endsWith('.pdf') ||
        typeof input.contentBase64 !== 'string' || input.contentBase64.length > 1_400_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) {
      return res.status(400).json({ error: 'Attach a valid PDF file no larger than 1 MB.' });
    }
    const content = Buffer.from(input.contentBase64, 'base64');
    if (!content.length || content.length > 1_048_576 || content.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(400).json({ error: 'Attach a valid PDF file no larger than 1 MB.' });
    }
    attachment = {
      filename: input.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'attachment.pdf',
      content
    };
  }
  const ids = Array.isArray(req.body?.userIds)
    ? [...new Set(req.body.userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (recipientMode !== 'all' && !ids.length) {
    return res.status(400).json({ error: 'Select at least one Alumni recipient.' });
  }
  if (recipientMode === 'individual' && ids.length !== 1) {
    return res.status(400).json({ error: 'Select exactly one Alumni for an individual message.' });
  }

  const recipients = recipientMode === 'all'
    ? db.prepare("SELECT id, name, email, contact FROM users WHERE role = 'alumni' AND (status IS NULL OR status = 'Active')").all()
    : db.prepare(`SELECT id, name, email, contact FROM users
        WHERE role = 'alumni' AND (status IS NULL OR status = 'Active')
        AND id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  if (recipients.length !== ids.length && recipientMode !== 'all') {
    return res.status(400).json({ error: 'One or more selected Alumni accounts are no longer active.' });
  }
  if (!recipients.length) return res.status(400).json({ error: 'No active Alumni recipients were found.' });
  if (recipients.length > 500) return res.status(400).json({ error: 'Send to no more than 500 Alumni at a time.' });
  if (channel === 'SMS' && recipients.some((user) => !String(user.contact || '').trim())) {
    return res.status(400).json({ error: 'Every selected Alumni must have a mobile number for SMS delivery.' });
  }
  if (channel === 'EMAIL' && recipients.some((user) => !String(user.email || '').trim())) {
    return res.status(400).json({ error: 'Every selected Alumni must have an email address for Email delivery.' });
  }

  const results = [];
  for (const recipient of recipients) {
    const result = channel === 'EMAIL'
      ? await sendMail({ to: recipient.email, subject, text: message, userId: recipient.id, attachments: attachment ? [attachment] : undefined })
      : await sendSms({ to: recipient.contact, message, userId: recipient.id });
    results.push({
      userId: recipient.id,
      recipient: recipient.name,
      destination: channel === 'EMAIL' ? recipient.email : recipient.contact,
      status: result.status,
      detail: result.reason || ''
    });
  }
  writeAudit(req.user, 'send', channel.toLowerCase(), '', `${results.length} recipient(s): ${subject || 'Manual message'}`);
  res.status(201).json({
    channel,
    attempted: results.length,
    accepted: results.filter((result) => result.status === 'accepted' || result.status === 'sent').length,
    failed: results.filter((result) => ['failed', 'not_configured'].includes(result.status)).length,
    results
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
