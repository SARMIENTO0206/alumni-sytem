import { Router } from 'express';
import { db, getSetting, mapAlumni, setSetting, writeAudit } from '../db.js';
import { isAlumni, ownsAlumniRecord, requireRole } from '../auth.js';
import { mirrorUpdate } from '../sync-supabase.js';
import { dispatchNotification } from '../notify.js';

const router = Router();
const DEFAULT_REMINDER_MONTHS = 6;
const TRACKING_STATUSES = [
  'Employed',
  'Self-employed',
  'Unemployed',
  'Seeking Employment',
  'Further Studies',
  'Technical/Vocational Training',
  'Not Currently Seeking'
];

function reminderMonths() {
  const settings = getSetting('system_settings', {});
  const value = Number(settings.tracking?.reminderMonths);
  return Number.isInteger(value) && value >= 1 && value <= 36 ? value : DEFAULT_REMINDER_MONTHS;
}

function freshnessCutoff(months = reminderMonths()) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

function trackingRows() {
  return db.prepare(`
    SELECT a.*, u.education_level AS user_education_level, u.strand AS user_strand,
      u.track AS user_track, u.education_level AS education_level
    FROM alumni a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
  `).all();
}

function isStale(row, cutoff) {
  const updated = row.last_updated ? new Date(row.last_updated) : null;
  return !updated || Number.isNaN(updated.getTime()) || updated < cutoff;
}

/** GET /api/tracking - role-scoped graduate tracking records and reminder settings. */
router.get('/', (req, res) => {
  let rows = trackingRows();
  if (isAlumni(req.user)) rows = rows.filter((row) => ownsAlumniRecord(req.user, row));

  const cutoff = freshnessCutoff();
  const stale = rows.filter((row) => isStale(row, cutoff));
  const countedStatuses = new Set(['Employed', 'Self-employed', 'Freelance']);
  const furtherStudies = new Set(['Further Studies', 'Post-grad', 'Postgraduate', 'Technical/Vocational Training']);
  const seekingEmployment = new Set(['Unemployed', 'Seeking Employment']);

  res.json({
    summary: {
      total: rows.length,
      employed: rows.filter((row) => countedStatuses.has(row.status)).length,
      furtherStudies: rows.filter((row) => furtherStudies.has(row.status)).length,
      seekingEmployment: rows.filter((row) => seekingEmployment.has(row.status)).length,
      freshness: rows.length ? Math.round(((rows.length - stale.length) / rows.length) * 100) : 0,
      staleCount: stale.length
    },
    reminderMonths: reminderMonths(),
    alumni: rows.map(mapAlumni)
  });
});

/** GET /api/tracking/settings - reminder policy visible to staff roles. */
router.get('/settings', requireRole('admin', 'staff'), (req, res) => {
  res.json({ reminderMonths: reminderMonths() });
});

/** PUT /api/tracking/settings - administrators configure profile reminder threshold. */
router.put('/settings', requireRole('admin'), (req, res) => {
  const months = Number(req.body?.reminderMonths);
  if (!Number.isInteger(months) || months < 1 || months > 36) {
    return res.status(400).json({ error: 'Reminder period must be a whole number from 1 to 36 months.' });
  }
  const settings = getSetting('system_settings', {});
  setSetting('system_settings', {
    ...settings,
    tracking: { ...(settings.tracking || {}), reminderMonths: months }
  });
  writeAudit(req.user, 'update', 'tracking_settings', 'reminder_months', String(months));
  res.json({ reminderMonths: months });
});

/** PUT /api/tracking/:id/employment - alumni may update only their own record. */
router.put('/:id/employment', (req, res) => {
  if (!isAlumni(req.user)) {
    return res.status(403).json({ error: 'Only alumni can submit graduate tracking updates.' });
  }
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });
  if (!ownsAlumniRecord(req.user, existing)) {
    return res.status(403).json({ error: 'You can only update your own graduate tracking information.' });
  }
  const {
    status, company, title, industry, employmentType, timeToFirst, location,
    educationSchool, educationProgram, educationStatus, educationYear
  } = req.body || {};
  if (!TRACKING_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Select a valid current education or employment status.' });
  }

  const employed = status === 'Employed' || status === 'Self-employed';
  const studying = status === 'Further Studies' || status === 'Technical/Vocational Training';
  const nextCompany = employed ? String(company || '').trim() : '';
  const nextTitle = employed ? String(title || '').trim() : '';
  if (employed && (!nextCompany || !nextTitle)) {
    return res.status(400).json({ error: 'Provide your current organization or business and role.' });
  }
  const validIndustries = new Set([
    'Education', 'Information Technology', 'Healthcare', 'Business/Retail',
    'Hospitality', 'Government/Public Service', 'Manufacturing', 'Others'
  ]);
  const validEmploymentTypes = new Set(['Full-time', 'Part-time', 'Contract', 'Temporary', 'Self-employed']);
  if (industry && !validIndustries.has(industry)) {
    return res.status(400).json({ error: 'Select a valid industry.' });
  }
  if (employmentType && !validEmploymentTypes.has(employmentType)) {
    return res.status(400).json({ error: 'Select a valid employment type.' });
  }
  if (studying && (!String(educationSchool || '').trim() || !String(educationProgram || '').trim())) {
    return res.status(400).json({ error: 'Provide your school or training provider and program.' });
  }

  db.prepare(
    `UPDATE alumni SET status = ?, company = ?, job_title = ?, industry = ?, employment_type = ?,
     time_to_first = ?, location = ?, education_school = ?, education_program = ?,
     education_status = ?, education_year = ?, tracking_review_status = 'Pending',
     tracking_review_note = '', tracking_reviewed_by = '', tracking_reviewed_at = ?, last_updated = ?
     WHERE id = ?`
  ).run(
    status,
    nextCompany,
    nextTitle,
    employed ? String(industry || '').trim() : '',
    employed ? String(employmentType || '').trim() : '',
    timeToFirst ?? existing.time_to_first,
    employed ? (location ?? existing.location) : '',
    studying ? String(educationSchool || '').trim() : '',
    studying ? String(educationProgram || '').trim() : '',
    studying ? String(educationStatus || '').trim() : '',
    studying ? String(educationYear || '').trim() : '',
    '',
    new Date().toISOString().split('T')[0],
    id
  );

  if (status === 'Employed' && nextCompany && nextTitle) {
    const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
    const duplicate = db.prepare(
      'SELECT id FROM placements WHERE alumni_id = ? AND company = ? AND title = ?'
    ).get(row.id, nextCompany, nextTitle);
    if (!duplicate) {
      db.prepare('INSERT INTO placements (alumni, company, title, date, alumni_id, user_id) VALUES (?, ?, ?, ?, ?, ?)').run(
        row.name, nextCompany, nextTitle, new Date().toISOString().split('T')[0], row.id, row.user_id || 0
      );
    }
  }

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

/** PUT /api/tracking/:id/review - Registrar verifies or flags an alumnus update. */
router.put('/:id/review', requireRole('staff'), (req, res) => {
  const id = Number(req.params.id);
  const { status, note } = req.body || {};
  if (!['Verified', 'Needs Follow-up'].includes(status)) {
    return res.status(400).json({ error: 'Choose Verified or Needs Follow-up.' });
  }
  const existing = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alumni record not found.' });
  const reviewNote = String(note || '').trim();
  if (reviewNote.length > 1000) return res.status(400).json({ error: 'Review note must be 1,000 characters or fewer.' });
  const reviewedAt = new Date().toISOString();
  db.prepare(
    `UPDATE alumni SET tracking_review_status = ?, tracking_review_note = ?,
     tracking_reviewed_by = ?, tracking_reviewed_at = ? WHERE id = ?`
  ).run(status, reviewNote, req.user.name || req.user.username, reviewedAt, id);
  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  writeAudit(req.user, 'review', 'graduate_tracking', id, status);
  mirrorUpdate('alumni', row);
  res.json({ alumni: mapAlumni(row) });
});

/** GET /api/tracking/stale-profiles - staff/admin profile reminder candidates. */
router.get('/stale-profiles', requireRole('admin', 'staff'), (req, res) => {
  const months = reminderMonths();
  const cutoff = freshnessCutoff(months);
  const stale = trackingRows().filter((row) => isStale(row, cutoff));
  res.json({
    cutoff: cutoff.toISOString().split('T')[0],
    reminderMonths: months,
    staleProfiles: stale.map(mapAlumni)
  });
});

/** POST /api/tracking/reminders/sweep - manually dispatch profile reminders. */
router.post('/reminders/sweep', requireRole('admin'), (req, res) => {
  const months = reminderMonths();
  const cutoff = freshnessCutoff(months);
  const stale = trackingRows().filter((row) => isStale(row, cutoff));

  for (const alumni of stale) {
    const user = alumni.user_id
      ? db.prepare('SELECT * FROM users WHERE id = ?').get(alumni.user_id)
      : db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?)').get(alumni.name);
    dispatchNotification({
      userId: user?.id || 0,
      alumniId: alumni.id,
      recipient: user?.contact || user?.email || alumni.contact || alumni.name,
      channel: 'SYSTEM',
      subject: 'Graduate information update reminder',
      message: 'Please review and update your current education or employment information in the Alumni Management System.',
      relatedType: 'system',
      relatedId: alumni.id,
      email: user?.email,
      phone: user?.contact || alumni.contact,
      sendSms: true
    }).catch(() => {});
  }

  res.json({ ok: true, reminderMonths: months, dispatchedCount: stale.length, recipients: stale.map((row) => row.name) });
});

export default router;
