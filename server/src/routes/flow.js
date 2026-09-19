import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

/* Legacy automated-flow routes: inbound message replies.
 *
 * The legacy job routes that used to live here (backed by the duplicate
 * `jobs` table) were removed. Because this router is mounted at /api before
 * the canonical job module, its GET/POST /jobs and POST /jobs/:id/applications
 * handlers shadowed routes/jobs.js (backed by `job_postings`), so the
 * documented job endpoints never ran. Job postings and applications are now
 * handled exclusively by src/routes/jobs.js. */

const router = Router();

router.post('/messages/:id/replies', (req, res) => {
  const notificationId = Number(req.params.id);
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
  if (!notification) return res.status(404).json({ error: 'Message record not found.' });
  const { sender, message } = req.body || {};
  if (!sender || !message) return res.status(400).json({ error: 'Sender and message are required.' });
  const info = db.prepare(
    `INSERT INTO message_replies (notification_id, channel, sender, message)
     VALUES (?, ?, ?, ?)`
  ).run(notificationId, notification.channel, sender, message);
  db.prepare("UPDATE notifications SET status = 'REPLIED' WHERE id = ?").run(notificationId);
  res.status(201).json({
    reply: { id: info.lastInsertRowid, notificationId, channel: notification.channel, sender, message, status: 'RECEIVED' }
  });
});

router.get('/messages/replies', requireRole('admin', 'registrar'), (req, res) => {
  const rows = db.prepare(
    `SELECT r.*, n.subject FROM message_replies r
     LEFT JOIN notifications n ON n.id = r.notification_id ORDER BY r.id DESC`
  ).all();
  res.json({ replies: rows });
});

export default router;
