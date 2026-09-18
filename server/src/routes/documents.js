import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

const mapTranscript = (r) => ({
  id: r.id, name: r.name, email: r.email, contact: r.contact, date: r.date,
  purpose: r.purpose, status: r.status, type: r.type, delivery: r.delivery, paymentRef: r.payment_ref
});

const mapReprint = (r) => ({ id: r.id, name: r.name, type: r.type, status: r.status });

const mapPlacement = (p) => ({ id: p.id, alumni: p.alumni, company: p.company, title: p.title, date: p.date });

/* ------------------------------- Transcripts ------------------------------ */

/** GET /api/transcripts - list all transcript / document requests. */
router.get('/transcripts', (req, res) => {
  const rows = db.prepare('SELECT * FROM transcript_requests ORDER BY id DESC').all();
  res.json({ requests: rows.map(mapTranscript) });
});

/** POST /api/transcripts - create a transcript request. */
router.post('/transcripts', (req, res) => {
  const { name, email, contact, purpose, type, delivery } = req.body || {};
  if (!name || !purpose) return res.status(400).json({ error: 'Name and purpose are required.' });

  const info = db.prepare(
    `INSERT INTO transcript_requests (name, email, contact, date, purpose, status, type, delivery, payment_ref)
     VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`
  ).run(
    name, email || '', contact || '', new Date().toISOString().split('T')[0],
    purpose, type || 'Transcript of Records', delivery || 'Pick-up at Registrar Window',
    (req.body && req.body.paymentRef) || 'N/A'
  );

  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ request: mapTranscript(row) });
});

/** PUT /api/transcripts/:id/status - advance a request (admin / registrar). */
router.put('/transcripts/:id/status', requireRole('admin', 'registrar'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ['Pending', 'Approved', 'Rejected', 'Released'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });

  const info = db.prepare('UPDATE transcript_requests SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) return res.status(404).json({ error: 'Request not found.' });

  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  res.json({ request: mapTranscript(row) });
});

/* ------------------------------- Reprints --------------------------------- */

/** GET /api/reprints - list certificate reprint requests. */
router.get('/reprints', (req, res) => {
  const rows = db.prepare('SELECT * FROM reprints ORDER BY id DESC').all();
  res.json({ reprints: rows.map(mapReprint) });
});

/** POST /api/reprints - file a certificate reprint request. */
router.post('/reprints', (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'Name and certificate type are required.' });
  const info = db.prepare('INSERT INTO reprints (name, type, status) VALUES (?, ?, \'Pending\')').run(name, type);
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ reprint: mapReprint(row) });
});

/** PUT /api/reprints/:id/status - approve/reject reprint (admin / registrar). */
router.put('/reprints/:id/status', requireRole('admin', 'registrar'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ['Pending', 'Approved', 'Rejected'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });

  const info = db.prepare('UPDATE reprints SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) return res.status(404).json({ error: 'Reprint request not found.' });
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  res.json({ reprint: mapReprint(row) });
});

/* ------------------------------- Placements ------------------------------- */

/** GET /api/placements - list job placement logs. */
router.get('/placements', (req, res) => {
  const rows = db.prepare('SELECT * FROM placements ORDER BY id DESC').all();
  res.json({ placements: rows.map(mapPlacement) });
});

/** POST /api/placements - record a job placement (admin only). */
router.post('/placements', requireRole('admin'), (req, res) => {
  const { alumni, company, title } = req.body || {};
  if (!alumni || !company || !title) {
    return res.status(400).json({ error: 'Alumnus name, company and job title are required.' });
  }
  const info = db.prepare(
    'INSERT INTO placements (alumni, company, title, date) VALUES (?, ?, ?, ?)'
  ).run(alumni, company, title, new Date().toISOString().split('T')[0]);
  const row = db.prepare('SELECT * FROM placements WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ placement: mapPlacement(row) });
});

export default router;