import { Router } from 'express';
import { db, mapAlumni } from '../db.js';
import { isAlumni, ownsAlumniRecord, requireRole } from '../auth.js';
import { mirrorUpdate } from '../sync-supabase.js';
import { dispatchNotification } from '../notify.js';

const router = Router();

const FRESHNESS_MONTHS = 6;

/** GET /api/tracking - graduate tracking summary + employment analytics. */
router.get('/', (req, res) => {
  let rows = db.prepare('SELECT * FROM alumni').all();
  if (isAlumni(req.user)) {
    rows = rows.filter((row) => ownsAlumniRecord(req.user, row));
  }

  const employmentCounts = rows.reduce((acc, a) => {
    const key = a.status || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const employedRows = rows.filter(a => (a.status === 'Employed' || a.status === 'Freelance') && a.job_title);
  const directRelated = employedRows.filter(a => (a.relevance || '').toLowerCase().includes('direct')).length;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - FRESHNESS_MONTHS);

  const stale = rows.filter(a => {
    const lu = a.last_updated ? new Date(a.last_updated) : null;
    return !lu || isNaN(lu.getTime()) || lu < cutoff;
  });

  res.json({
    summary: {
      total: rows.length,
      employed: rows.filter(a => a.status === 'Employed').length,
      freelance: rows.filter(a => a.status === 'Freelance').length,
      unemployed: rows.filter(a => a.status === 'Unemployed').length,
      employmentRate: rows.length ? Math.round(((rows.filter(a => a.status === 'Employed' || a.status === 'Freelance').length) / rows.length) * 100) : 0,
      fieldAlignment: employedRows.length ? Math.round((directRelated / employedRows.length) * 100) : 0,
      freshness: rows.length ? Math.round(((rows.length - stale.length) / rows.length) * 100) : 0,
      staleCount: stale.length
    },
    employmentCounts,
    alumni: rows.map(mapAlumni)
  });
});

/** PUT /api/tracking/:id/employment - alumni may update only their own record. */
router.put('/:id/employment', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });
  if (!ownsAlumniRecord(req.user, existing)) {
    return res.status(403).json({ error: 'You can only update your own graduate tracking information.' });
  }
  const { status, company, title, relevance, timeToFirst, location, educationSchool, educationProgram, educationStatus, educationYear } = req.body || {};
  const allowed = ['Employed', 'Unemployed', 'Freelance', 'Further Studies', 'Post-grad'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid employment status value.' });

  const nextStatus = status || existing.status;
  db.prepare(
    `UPDATE alumni SET status = ?, company = ?, job_title = ?, relevance = ?, time_to_first = ?, location = ?,
     education_school = ?, education_program = ?, education_status = ?, education_year = ?, last_updated = ?
     WHERE id = ?`
  ).run(
    nextStatus,
    company ?? existing.company,
    title ?? existing.job_title,
    relevance ?? existing.relevance,
    timeToFirst ?? existing.time_to_first,
    location ?? existing.location,
    educationSchool ?? existing.education_school,
    educationProgram ?? existing.education_program,
    educationStatus ?? existing.education_status,
    educationYear ?? existing.education_year,
    new Date().toISOString().split('T')[0],
    id
  );

  if (nextStatus === 'Employed' && company && title) {
    const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
    db.prepare('INSERT INTO placements (alumni, company, title, date, alumni_id, user_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      row.name, company, title, new Date().toISOString().split('T')[0], row.id, row.user_id || 0
    );
  }

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

/** GET /api/stale-profiles - alumni with profiles older than the freshness window. */
router.get('/stale-profiles', requireRole('admin', 'staff'), (req, res) => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - FRESHNESS_MONTHS);

  const rows = db.prepare('SELECT * FROM alumni').all();
  const stale = rows.filter(a => {
    const lu = a.last_updated ? new Date(a.last_updated) : null;
    return !lu || isNaN(lu.getTime()) || lu < cutoff;
  });

  res.json({ cutoff: cutoff.toISOString().split('T')[0], staleProfiles: stale.map(mapAlumni) });
});

/** POST /api/reminders/sweep - dispatch SMS reminders to stale profiles (admin only). */
router.post('/reminders/sweep', requireRole('admin', 'staff'), (req, res) => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - FRESHNESS_MONTHS);

  const rows = db.prepare('SELECT * FROM alumni').all();
  const dispatched = rows
    .filter(a => {
      const lu = a.last_updated ? new Date(a.last_updated) : null;
      return !lu || isNaN(lu.getTime()) || lu < cutoff;
    })
    .map(a => a.name);

  for (const name of dispatched) {
    const alumni = db.prepare('SELECT * FROM alumni WHERE name = ?').get(name);
    const user = alumni?.user_id
      ? db.prepare('SELECT * FROM users WHERE id = ?').get(alumni.user_id)
      : db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?)').get(name);
    dispatchNotification({
      userId: user?.id || 0,
      alumniId: alumni?.id || 0,
      recipient: user?.contact || user?.email || name,
      channel: 'SYSTEM',
      subject: 'Grad Tracking Update Reminder',
      message: 'Please update your employment or education status through the Alumni Management System.',
      relatedType: 'system',
      relatedId: alumni?.id || '',
      email: user?.email,
      phone: user?.contact,
      sendSms: true
    }).catch(() => {});
  }

  res.json({ ok: true, dispatchedCount: dispatched.length, recipients: dispatched });
});

export default router;