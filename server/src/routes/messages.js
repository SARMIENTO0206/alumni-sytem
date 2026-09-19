import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();
const channels = ['SMS', 'EMAIL'];
const statuses = ['Queued', 'Sent', 'Delivered', 'Failed', 'Received'];

const mapOutbound = (row) => ({
  id: row.id, channel: row.channel, recipient: row.recipient, subject: row.subject,
  body: row.body, status: row.status, relatedType: row.related_type, relatedId: row.related_id,
  createdBy: row.created_by, createdAt: row.created_at, sentAt: row.sent_at
});
const mapInbound = (row) => ({
  id: row.id, outboundMessageId: row.outbound_message_id, channel: row.channel,
  sender: row.sender, body: row.body, receivedAt: row.received_at
});

router.get('/messages/outbound', requireRole('admin', 'registrar'), (req, res) => {
  const rows = db.prepare('SELECT * FROM outbound_messages ORDER BY id DESC').all();
  res.json({ messages: rows.map(mapOutbound) });
});

router.post('/messages/outbound', requireRole('admin', 'registrar'), (req, res) => {
  const { channel, recipient, subject, body, relatedType, relatedId } = req.body || {};
  if (!channels.includes(channel) || !recipient || !body) {
    return res.status(400).json({ error: 'channel, recipient and body are required; channel must be SMS or EMAIL.' });
  }
  const info = db.prepare(
    `INSERT INTO outbound_messages
     (channel, recipient, subject, body, status, related_type, related_id, created_by, sent_at)
     VALUES (?, ?, ?, ?, 'Sent', ?, ?, ?, datetime('now'))`
  ).run(channel, recipient, subject || '', body, relatedType || '', relatedId || null, req.user.id);
  const row = db.prepare('SELECT * FROM outbound_messages WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('INSERT INTO message_status_history (outbound_message_id, status, detail) VALUES (?, ?, ?)')
    .run(row.id, row.status, 'Demo dispatch; no external provider was contacted.');
  res.status(201).json({ message: mapOutbound(row), demo: true });
});

router.put('/messages/outbound/:id/status', requireRole('admin', 'registrar'), (req, res) => {
  const { status, detail } = req.body || {};
  if (!statuses.includes(status)) return res.status(400).json({ error: 'Invalid message status value.' });
  const id = Number(req.params.id);
  const info = db.prepare(
    `UPDATE outbound_messages SET status = ?, sent_at = CASE WHEN ? IN ('Sent', 'Delivered') THEN COALESCE(sent_at, datetime('now')) ELSE sent_at END
     WHERE id = ?`
  ).run(status, status, id);
  if (!info.changes) return res.status(404).json({ error: 'Outbound message not found.' });
  db.prepare('INSERT INTO message_status_history (outbound_message_id, status, detail) VALUES (?, ?, ?)')
    .run(id, status, detail || '');
  res.json({ message: mapOutbound(db.prepare('SELECT * FROM outbound_messages WHERE id = ?').get(id)) });
});

router.get('/messages/inbound', (req, res) => {
  const isStaff = ['admin', 'registrar'].includes(req.user.role);
  const rows = isStaff
    ? db.prepare('SELECT * FROM inbound_replies ORDER BY id DESC').all()
    : db.prepare(
      `SELECT i.* FROM inbound_replies i
       JOIN outbound_messages o ON o.id = i.outbound_message_id
       WHERE o.created_by = ? OR o.recipient IN (?, ?)
       ORDER BY i.id DESC`
    ).all(req.user.id, req.user.email, req.user.contact);
  res.json({ replies: rows.map(mapInbound) });
});

router.post('/messages/inbound', (req, res) => {
  const { outboundMessageId, channel, sender, body } = req.body || {};
  if (!channels.includes(channel) || !sender || !body) {
    return res.status(400).json({ error: 'channel, sender and body are required; channel must be SMS or EMAIL.' });
  }
  if (outboundMessageId) {
    const outbound = db.prepare('SELECT id FROM outbound_messages WHERE id = ?').get(Number(outboundMessageId));
    if (!outbound) return res.status(404).json({ error: 'Outbound message not found.' });
  }
  const info = db.prepare(
    'INSERT INTO inbound_replies (outbound_message_id, channel, sender, body) VALUES (?, ?, ?, ?)'
  ).run(outboundMessageId || null, channel, sender, body);
  if (outboundMessageId) {
    db.prepare('UPDATE outbound_messages SET status = \'Received\' WHERE id = ?').run(Number(outboundMessageId));
    db.prepare('INSERT INTO message_status_history (outbound_message_id, status, detail) VALUES (?, \'Received\', ?)')
      .run(Number(outboundMessageId), 'Demo inbound reply recorded.');
  }
  res.status(201).json({ reply: mapInbound(db.prepare('SELECT * FROM inbound_replies WHERE id = ?').get(info.lastInsertRowid)), demo: true });
});

export default router;
