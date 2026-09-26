import { Router } from 'express';
import { db, mapAlumni, writeAudit } from '../db.js';
import { isAdmin, isAlumni, ownsAlumniRecord, requireRole } from '../auth.js';
import { mirror, mirrorUpdate } from '../sync-supabase.js';
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
  const recordStatus = String(req.query.recordStatus || '').trim();
  const includeArchived = recordStatus === 'All' || recordStatus === 'Archived';
  if (includeArchived && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only the System Administrator can view archived alumni records.' });
  }

  let rows = scopeAlumniRows(req.user, db.prepare(`
    SELECT a.*, u.education_level AS education_level, u.strand AS strand, u.track AS track
    FROM alumni a LEFT JOIN users u ON u.id = a.user_id
    WHERE (? = 1 OR COALESCE(a.archived_at, '') = '')
    ORDER BY a.id DESC
  `).all(includeArchived ? 1 : 0));
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
  if (recordStatus === 'Archived') rows = rows.filter((a) => Boolean(a.archived_at));
  if (recordStatus === 'Pending Verification') rows = rows.filter((a) => a.verification_status === 'Pending Verification');
  if (recordStatus === 'Verified') rows = rows.filter((a) => !a.archived_at && a.verification_status === 'Verified');

  res.json({ alumni: rows.map(mapAlumni) });
});

/** GET /api/alumni/:id - single alumni record. */
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, u.education_level AS education_level, u.strand AS strand, u.track AS track
    FROM alumni a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Alumni record not found.' });
  if (row.archived_at && !isAdmin(req.user)) return res.status(404).json({ error: 'Alumni record not found.' });
  if (!ownsAlumniRecord(req.user, row)) {
    return res.status(403).json({ error: 'You can only view your own alumni record.' });
  }
  res.json({ alumni: mapAlumni(row) });
});

/** POST /api/alumni - Registrar creates an alumni record for verification. */
router.post('/', requireRole('staff'), (req, res) => {
  const { name, batch, program, status, company, title, contact, studentId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  let mobile = '';
  try { mobile = normalizePhMobile(contact); } catch (err) { return res.status(400).json({ error: err.message }); }

  const generatedStudentId = studentId || `SAA-${batch || new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const duplicate = db.prepare(
    'SELECT id FROM alumni WHERE LOWER(name) = LOWER(?) AND batch = ?'
  ).get(name, batch || '');
  if (duplicate) return res.status(409).json({ error: 'An alumni record with this name and batch already exists.' });
  if (studentId && db.prepare('SELECT id FROM alumni WHERE LOWER(student_id) = LOWER(?)').get(studentId)) {
    return res.status(409).json({ error: 'This Student / Alumni ID is already assigned to another record.' });
  }
  const info = db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Related', '', 'Local', ?, ?, 'Pending Verification')`
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

/** PUT /api/alumni/:id - Registrar maintains an alumni record. */
router.put('/:id', requireRole('staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });
  if (existing.archived_at) return res.status(409).json({ error: 'Archived alumni records must be restored before editing.' });

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

router.post('/:id/verify', requireRole('staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing || existing.archived_at) return res.status(404).json({ error: 'Active alumni record not found.' });
  if (existing.verification_status === 'Verified') {
    return res.status(409).json({ error: 'This alumni record is already verified.' });
  }

  const verifiedAt = new Date().toISOString();
  db.prepare(
    `UPDATE alumni SET verification_status = 'Verified', verified_by = ?, verified_at = ? WHERE id = ?`
  ).run(req.user.name || req.user.username, verifiedAt, id);
  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  writeAudit(req.user, 'verify', 'alumni', id, row.name);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

router.post('/:id/archive', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });
  if (existing.archived_at) return res.status(409).json({ error: 'This alumni record is already archived.' });

  const archivedAt = new Date().toISOString();
  const priorUserStatus = existing.user_id
    ? db.prepare('SELECT status FROM users WHERE id = ?').get(existing.user_id)?.status || 'Active'
    : '';
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE alumni SET archived_at = ?, archived_user_status = ? WHERE id = ?')
      .run(archivedAt, priorUserStatus, id);
    if (existing.user_id) {
      db.prepare("UPDATE users SET status = 'Inactive' WHERE id = ?").run(existing.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.user_id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  writeAudit(req.user, 'archive', 'alumni', id, row.name);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

router.post('/:id/restore', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing || !existing.archived_at) return res.status(404).json({ error: 'Archived alumni record not found.' });

  db.exec('BEGIN');
  try {
    db.prepare("UPDATE alumni SET archived_at = '', archived_user_status = '' WHERE id = ?").run(id);
    if (existing.user_id) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?')
        .run(existing.archived_user_status || 'Active', existing.user_id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  writeAudit(req.user, 'restore', 'alumni', id, row.name);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

export default router;