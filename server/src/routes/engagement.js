import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

const parseJson = (str, fallback) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return fallback; }
};

const mapEvent = (e) => ({
  id: e.id, title: e.title, date: e.date, location: e.location, rsvps: e.rsvps,
  registered: Boolean(e.registered), status: e.status, attendees: parseJson(e.attendees, [])
});

const mapReunion = (r) => ({
  id: r.id, batch: r.batch, date: r.date, venue: r.venue, coordinators: r.coordinators,
  confirmed: Boolean(r.confirmed), attendees: parseJson(r.attendees, [])
});

/* --------------------------------- Events --------------------------------- */

/** GET /api/events - list alumni events. */
router.get('/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY id DESC').all();
  res.json({ events: rows.map(mapEvent) });
});

/** POST /api/events - create an event (admin only). */
router.post('/events', requireRole('admin'), (req, res) => {
  const { title, date, location } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Event title is required.' });

  const info = db.prepare(
    "INSERT INTO events (title, date, location, rsvps, registered, status, attendees) VALUES (?, ?, ?, 0, 0, 'Upcoming', '[]')"
  ).run(title, date || '', location || '');

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ event: mapEvent(row) });
});

/** POST /api/events/:id/rsvp - an alumnus registers / withdraws RSVP. */
router.post('/events/:id/rsvp', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });

  const registered = row.registered ? 0 : 1;
  const rsvps = row.rsvps + (registered ? 1 : -1);

  db.prepare('UPDATE events SET registered = ?, rsvps = ? WHERE id = ?').run(registered, Math.max(0, rsvps), id);
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.json({ event: mapEvent(updated) });
});

/* -------------------------------- Reunions -------------------------------- */

/** GET /api/reunions - list batch reunions. */
router.get('/reunions', (req, res) => {
  const rows = db.prepare('SELECT * FROM reunions ORDER BY id DESC').all();
  res.json({ reunions: rows.map(mapReunion) });
});

/** POST /api/reunions - create a reunion (admin only). */
router.post('/reunions', requireRole('admin'), (req, res) => {
  const { batch, date, venue, coordinators } = req.body || {};
  if (!batch) return res.status(400).json({ error: 'Batch label is required.' });

  const info = db.prepare(
    "INSERT INTO reunions (batch, date, venue, coordinators, confirmed, attendees) VALUES (?, ?, ?, ?, 0, '[]')"
  ).run(batch, date || '', venue || '', coordinators || '');

  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ reunion: mapReunion(row) });
});

/* -------------------------------- Donations ------------------------------- */

/** GET /api/donations - list donation records. */
router.get('/donations', (req, res) => {
  const rows = db.prepare('SELECT * FROM donations ORDER BY id DESC').all();
  res.json({ donations: rows.map(d => ({ id: d.id, campaign: d.campaign, donor: d.donor, amount: d.amount, date: d.date })) });
});

/** POST /api/donations - record a donation. */
router.post('/donations', (req, res) => {
  const { campaign, donor, amount } = req.body || {};
  if (!campaign || amount == null) return res.status(400).json({ error: 'Campaign and amount are required.' });

  const info = db.prepare(
    'INSERT INTO donations (campaign, donor, amount, date) VALUES (?, ?, ?, ?)'
  ).run(campaign, donor || 'Anonymous', Number(amount), new Date().toISOString().split('T')[0]);

  const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ donation: { id: row.id, campaign: row.campaign, donor: row.donor, amount: row.amount, date: row.date } });
});

/* ------------------------------- Newsletters ------------------------------ */

/** GET /api/newsletters - list the newsletter archive. */
router.get('/newsletters', (req, res) => {
  const rows = db.prepare('SELECT * FROM newsletters ORDER BY id DESC').all();
  res.json({ newsletters: rows.map(n => ({ id: n.id, subject: n.subject, body: n.body, sentAt: n.sent_at })) });
});

/** POST /api/newsletters - publish a newsletter (admin / registrar). */
router.post('/newsletters', requireRole('admin', 'registrar'), (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });

  const info = db.prepare(
    'INSERT INTO newsletters (subject, body, sent_at) VALUES (?, ?, ?)'
  ).run(subject, body || '', new Date().toISOString().split('T')[0]);

  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ newsletter: { id: row.id, subject: row.subject, body: row.body, sentAt: row.sent_at } });
});

/* -------------------------------- Feedback -------------------------------- */

/** GET /api/feedback - list survey feedback (admin / registrar). */
router.get('/feedback', requireRole('admin', 'registrar'), (req, res) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC').all();
  res.json({ feedback: rows.map(f => ({ id: f.id, name: f.name, rating: f.rating, category: f.category, message: f.message, createdAt: f.created_at })) });
});

/** POST /api/feedback - submit alumni feedback. */
router.post('/feedback', (req, res) => {
  const { name, rating, category, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Feedback message is required.' });

  const info = db.prepare(
    'INSERT INTO feedback (name, rating, category, message) VALUES (?, ?, ?, ?)'
  ).run(name || 'Anonymous', Number(rating) || 5, category || 'General', message);

  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ feedback: { id: row.id, name: row.name, rating: row.rating, category: row.category, message: row.message, createdAt: row.created_at } });
});

/* ------------------------------ Notifications ----------------------------- */

/** GET /api/notifications - list the notification log (admin / registrar). */
router.get('/notifications', requireRole('admin', 'registrar'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(
    'SELECT * FROM notifications ORDER BY id DESC LIMIT ?'
  ).all(limit);
  res.json({ notifications: rows.map(n => ({
    id: n.id, channel: n.channel, recipient: n.recipient, subject: n.subject,
    message: n.message, createdAt: n.created_at
  })) });
});

/** POST /api/notifications - log a dispatched EMAIL/SMS notification server-side. */
router.post('/notifications', (req, res) => {
  const { channel, recipient, subject, message } = req.body || {};
  if (!channel || !recipient || !subject) {
    return res.status(400).json({ error: 'channel, recipient and subject are required.' });
  }
  const info = db.prepare(
    'INSERT INTO notifications (channel, recipient, subject, message) VALUES (?, ?, ?, ?)'
  ).run(channel, recipient, subject, message || '');

  res.status(201).json({ notification: { id: info.lastInsertRowid, channel, recipient, subject, message: message || '' } });
});

export default router;