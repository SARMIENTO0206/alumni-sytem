import { Router } from 'express';
import { db, mapAlumni, writeAudit } from '../db.js';
import { isAlumni, ownsAlumniRecord, requireRole } from '../auth.js';
import { mirror, mirrorUpdate, mirrorDelete } from '../sync-supabase.js';
import { normalizePhMobile } from '../phone.js';

const router = Router();

function scopeAlumniRows(user, rows) {
  if (!isAlumni(user)) return rows;
  return rows.filter((row) => ownsAlumniRecord(user, row));
}

/** GET /api/alumni - staff/admin see all; alumni see only their own record. */
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const batch = String(req.query.batch || '').trim();
  const status = String(req.query.status || '').trim();
  const program = String(req.query.program || '').trim().toLowerCase();

  let rows = scopeAlumniRows(req.user, db.prepare(`
    SELECT a.*, u.education_level AS education_level, u.strand AS strand, u.track AS track
    FROM alumni a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC
  `).all());
  if (q) {
    rows = rows.filter((a) =>
      [a.name, a.student_id, a.program, a.company, a.job_title]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }
  if (batch) rows = rows.filter((a) => String(a.batch) === batch);
  if (status) rows = rows.filter((a) => a.status === status);
  if (program) rows = rows.filter((a) => String(a.program || '').toLowerCase().includes(program));

  res.json({ alumni: rows.map(mapAlumni) });
});

/** GET /api/alumni/:id - single alumni record. */
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, u.education_level AS education_level, u.strand AS strand, u.track AS track
    FROM alumni a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Alumni record not found.' });
  if (!ownsAlumniRecord(req.user, row)) {
    return res.status(403).json({ error: 'You can only view your own alumni record.' });
  }
  res.json({ alumni: mapAlumni(row) });
});

/** POST /api/alumni - create an alumni record (admin / staff). */
router.post('/', requireRole('admin', 'staff'), (req, res) => {
  const { name, batch, program, status, company, title, contact, studentId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  let mobile = '';
  try { mobile = normalizePhMobile(contact); } catch (err) { return res.status(400).json({ error: err.message }); }

  const generatedStudentId = studentId || `SAA-${batch || new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const duplicate = db.prepare(
    'SELECT id FROM alumni WHERE LOWER(name) = LOWER(?) AND batch = ?'
  ).get(name, batch || '');
  if (duplicate) return res.status(409).json({ error: 'An alumni record with this name and batch already exists.' });
  const info = db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Related', '', 'Local', ?, ?)`
  ).run(
    name, batch || '', program || '', status || 'No Data', company || '', title || '',
    mobile, generatedStudentId,
    (status && status !== 'No Data' ? new Date().toISOString().split('T')[0] : '')
  );

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(info.lastInsertRowid);
  writeAudit(req.user, 'create', 'alumni', row.id, row.name);
  mirror('alumni', row);
  res.status(201).json({ alumni: mapAlumni(row) });
});

/** PUT /api/alumni/:id - update an alumni record (admin / staff). */
router.put('/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });

  const { name, batch, program, status, company, title, contact, relevance, timeToFirst, location, studentId } = req.body || {};
  let mobile = existing.contact;
  try { mobile = contact === undefined ? existing.contact : normalizePhMobile(contact); } catch (err) {
    return res.status(400).json({ error: err.message });
  }
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
    mobile,
    relevance ?? existing.relevance,
    timeToFirst ?? existing.time_to_first,
    location ?? existing.location,
    studentId ?? existing.student_id,
    new Date().toISOString().split('T')[0],
    id
  );

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  writeAudit(req.user, 'update', 'alumni', id, row?.name || '');
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

/** DELETE /api/alumni/:id - delete an alumni record (admin / staff). */
router.delete('/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM alumni WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Alumni record not found.' });
  writeAudit(req.user, 'delete', 'alumni', id, '');
  mirrorDelete('alumni', id);
  res.status(204).end();
});

export default router;