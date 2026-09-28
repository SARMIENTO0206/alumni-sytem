import { Router } from 'express';
import { db, mapAlumni, writeAudit } from '../db.js';
import { isAdmin, isAlumni, isStaff, ownsAlumniRecord, requireRole } from '../auth.js';
import { mirror, mirrorUpdate } from '../sync-supabase.js';
import { dispatchNotification, dispatchStaffAudience } from '../notify.js';
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
/* ---------------------- Academic record corrections ------------------------
 * Verified academic data (Alumni ID, batch, program, strand) is owned by the
 * Registrar. Alumni request a correction, the Registrar/Admin reviews the
 * request, and the verified record is only changed by staff.
 * -------------------------------------------------------------------------- */

const CORRECTION_FIELDS = ['Alumni ID', 'Batch Year', 'Program / Course', 'Strand / Track', 'Other'];

function mapCorrection(row) {
  if (!row) return null;
  return {
    id: row.id,
    alumniId: row.alumni_id,
    userId: row.user_id,
    field: row.field,
    message: row.message,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    alumniName: row.alumni_name || '',
    alumniCode: row.alumni_code || ''
  };
}

/** GET /api/alumni/corrections - own requests for Alumni, all requests for staff. */
router.get('/corrections', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COALESCE(a.name, '') AS alumni_name, COALESCE(a.student_id, '') AS alumni_code
    FROM record_corrections c
    LEFT JOIN alumni a ON a.id = c.alumni_id
    ORDER BY c.id DESC
    LIMIT 100
  `).all();
  if (isAlumni(req.user)) {
    const own = rows.filter((row) => Number(row.user_id) === Number(req.user.id)
      || ownsAlumniRecord(req.user, { id: row.alumni_id, user_id: row.user_id }));
    return res.json({ corrections: own.map(mapCorrection) });
  }
  if (!isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view record corrections.' });
  }
  res.json({ corrections: rows.map(mapCorrection) });
});

/** POST /api/alumni/:id/correction-request - the alumnus asks the Registrar to fix academic data. */
router.post('/:id/correction-request', async (req, res) => {
  const id = Number(req.params.id);
  const record = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!record || record.archived_at) return res.status(404).json({ error: 'Alumni record not found.' });
  if (!isAlumni(req.user) || !ownsAlumniRecord(req.user, record)) {
    return res.status(403).json({ error: 'Only the alumnus who owns this record can request a correction.' });
  }
  const field = String(req.body?.field || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!CORRECTION_FIELDS.includes(field)) {
    return res.status(400).json({ error: 'Choose the academic field that needs correction.' });
  }
  if (!message) return res.status(400).json({ error: 'Describe the correction you need.' });
  if (message.length > 1000) {
    return res.status(400).json({ error: 'Keep the correction request under 1,000 characters.' });
  }
  const pending = db.prepare("SELECT id FROM record_corrections WHERE alumni_id = ? AND status = 'Pending'").get(id);
  if (pending) {
    return res.status(409).json({ error: 'You already have a correction request waiting for the Registrar.' });
  }
  const info = db.prepare(
    'INSERT INTO record_corrections (alumni_id, user_id, field, message) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, field, message);
  const row = db.prepare('SELECT * FROM record_corrections WHERE id = ?').get(info.lastInsertRowid);
  writeAudit(req.user, 'create', 'record_correction', row.id, `${field}: ${record.name}`);
  dispatchStaffAudience(
    `Academic record correction: ${record.name}`,
    `${req.user.name || 'An alumnus'} requested a correction on ${field}. Review the verified school record in Alumni Record Verification.`,
    'alumni',
    id
  ).catch(() => {});
  dispatchNotification({
    userId: req.user.id,
    recipient: req.user.email || req.user.name,
    channel: 'SYSTEM',
    subject: 'Correction request received',
    message: `Your ${field} correction request was sent to the Registrar for review. Academic data stays unchanged until it is approved.`,
    relatedType: 'profile',
    relatedId: row.id
  }).catch(() => {});
  res.status(201).json({ correction: mapCorrection(row) });
});

/** POST /api/alumni/corrections/:id/resolve - Registrar/Admin close the request. */
router.post('/corrections/:id/resolve', requireRole('staff', 'admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM record_corrections WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Correction request not found.' });
  if (row.status !== 'Pending') return res.status(409).json({ error: 'This correction request is already closed.' });
  const outcome = String(req.body?.status || 'Resolved');
  if (!['Resolved', 'Declined'].includes(outcome)) {
    return res.status(400).json({ error: 'Choose Resolved or Declined.' });
  }
  const note = String(req.body?.note || '').trim();
  if (outcome === 'Declined' && !note) {
    return res.status(400).json({ error: 'Explain why the correction was declined.' });
  }
  db.prepare('UPDATE record_corrections SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .run(outcome, note, req.user.name || req.user.username, new Date().toISOString(), id);
  const updated = db.prepare('SELECT * FROM record_corrections WHERE id = ?').get(id);
  writeAudit(req.user, 'update', 'record_correction', id, `${outcome}: ${row.field}`);
  if (row.user_id) {
    dispatchNotification({
      userId: row.user_id,
      recipient: '',
      channel: 'SYSTEM',
      subject: `Correction request ${outcome.toLowerCase()}`,
      message: note || `The Registrar marked your ${row.field} correction request as ${outcome.toLowerCase()}.`,
      relatedType: 'profile',
      relatedId: id
    }).catch(() => {});
  }
  res.json({ correction: mapCorrection(updated) });
});

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

/**
 * Official Alumni ID, issued by the system on verification:
 *   SAA-<graduation year>-<sequence>   e.g. SAA-2026-0025
 * Only alumni records carry this ID - staff and admin accounts use user_code.
 */
function issueAlumniId(batch) {
  const year = /^\d{4}$/.test(String(batch || '').trim()) ? String(batch).trim() : String(new Date().getFullYear());
  const rows = db.prepare('SELECT student_id FROM alumni WHERE student_id LIKE ?').all(`SAA-${year}-%`);
  let highest = 0;
  for (const row of rows) {
    const match = String(row.student_id || '').match(/(\d+)\s*$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `SAA-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/** POST /api/alumni - Registrar creates an alumni record for verification. */
router.post('/', requireRole('staff'), (req, res) => {
  const { name, batch, program, status, company, title, contact, studentId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  let mobile = '';
  try { mobile = normalizePhMobile(contact); } catch (err) { return res.status(400).json({ error: err.message }); }

  /* The school record number is optional. The official Alumni ID is issued when
     the Registrar verifies the record, so it is never typed by hand here. */
  const schoolRecordNo = String(studentId || '').trim();
  const duplicate = db.prepare(
    'SELECT id FROM alumni WHERE LOWER(name) = LOWER(?) AND batch = ?'
  ).get(name, batch || '');
  if (duplicate) return res.status(409).json({ error: 'An alumni record with this name and batch already exists.' });
  if (schoolRecordNo && db.prepare('SELECT id FROM alumni WHERE LOWER(student_id) = LOWER(?)').get(schoolRecordNo)) {
    return res.status(409).json({ error: 'This school record number is already assigned to another record.' });
  }
  const info = db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Related', '', 'Local', ?, ?, 'Pending Verification')`
  ).run(
    name, batch || '', program || '', status || 'No Data', company || '', title || '',
    mobile, schoolRecordNo,
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
  if (existing.verification_status === 'Verified' && studentId !== undefined
      && String(studentId).trim() && String(studentId).trim() !== String(existing.student_id || '')) {
    return res.status(409).json({ error: 'The Alumni ID is issued by the system and cannot be edited after verification.' });
  }
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
  /* Verification mints the official Alumni ID when the record does not carry a
     school-issued one, exactly like the Alumni Portal flow documents. */
  const alumniId = String(existing.student_id || '').trim() || issueAlumniId(existing.batch);
  db.prepare(
    `UPDATE alumni SET verification_status = 'Verified', verified_by = ?, verified_at = ?, student_id = ? WHERE id = ?`
  ).run(req.user.name || req.user.username, verifiedAt, alumniId, id);
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