import { Router } from 'express';
import { db, mapAlumni } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** GET /api/alumni - list all alumni records (auth required). */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM alumni ORDER BY id DESC').all();
  res.json({ alumni: rows.map(mapAlumni) });
});

/** GET /api/alumni/:id - single alumni record. */
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Alumni record not found.' });
  res.json({ alumni: mapAlumni(row) });
});

/** POST /api/alumni - create an alumni record (admin only). */
router.post('/', requireRole('admin'), (req, res) => {
  const { name, batch, program, status, company, title, contact, studentId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const generatedStudentId = studentId || `SAA-${batch || new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const info = db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Related', '', 'Local', ?, ?)`
  ).run(
    name, batch || '', program || '', status || 'Employed', company || '', title || '',
    contact || '', generatedStudentId, new Date().toISOString().split('T')[0]
  );

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ alumni: mapAlumni(row) });
});

/** PUT /api/alumni/:id - update an alumni record (admin only). */
router.put('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });

  const { name, batch, program, status, company, title, contact, relevance, timeToFirst, location, studentId } = req.body || {};
  db.prepare(
    `UPDATE alumni SET name = ?, batch = ?, program = ?, status = ?, company = ?, job_title = ?,
     contact = ?, relevance = ?, time_to_first = ?, location = ?, student_id = ?, last_updated = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    batch ?? existing.batch,
    program ?? existing.program,
    status ?? existing.status,
    company ?? existing.company,
    title ?? existing.job_title,
    contact ?? existing.contact,
    relevance ?? existing.relevance,
    timeToFirst ?? existing.time_to_first,
    location ?? existing.location,
    studentId ?? existing.student_id,
    new Date().toISOString().split('T')[0],
    id
  );

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  res.json({ alumni: mapAlumni(row) });
});

/** DELETE /api/alumni/:id - delete an alumni record (admin only). */
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM alumni WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Alumni record not found.' });
  res.status(204).end();
});

export default router;