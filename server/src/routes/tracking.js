import { Router } from 'express';
import { db, mapAlumni } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

const FRESHNESS_MONTHS = 6;

/** GET /api/tracking - graduate tracking summary + employment analytics. */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM alumni').all();

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

/** PUT /api/tracking/:id/employment - update a graduate's employment/education outcome. */
router.put('/:id/employment', (req, res) => {
  const id = Number(req.params.id);
  const { status, company, title, relevance, timeToFirst, location } = req.body || {};
  const allowed = ['Employed', 'Unemployed', 'Freelance', 'Further Studies'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid employment status value.' });

  const info = db.prepare(
    `UPDATE alumni SET status = ?, company = ?, job_title = ?, relevance = ?, time_to_first = ?, location = ?, last_updated = ?
     WHERE id = ?`
  ).run(
    status, company || '', title || '', relevance || 'Not Related', timeToFirst || '',
    location || 'Local', new Date().toISOString().split('T')[0], id
  );

  if (info.changes === 0) return res.status(404).json({ error: 'Alumni record not found.' });

  // Log a placement when the graduate is employed.
  if (status === 'Employed' && company && title) {
    const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
    db.prepare('INSERT INTO placements (alumni, company, title, date) VALUES (?, ?, ?, ?)').run(
      row.name, company, title, new Date().toISOString().split('T')[0]
    );
  }

  const row = db.prepare('SELECT * FROM alumni WHERE id = ?').get(id);
  res.json({ alumni: mapAlumni(row) });
});

/** GET /api/stale-profiles - alumni with profiles older than the freshness window. */
router.get('/stale-profiles', (req, res) => {
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
router.post('/reminders/sweep', requireRole('admin'), (req, res) => {
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
    db.prepare(
      'INSERT INTO notifications (channel, recipient, subject, message) VALUES (\'SMS\', ?, ?, ?)'
    ).run(
      name,
      'Grad Tracking Update Reminder',
      'ST. AGNES ACADEMY OF CALOOCAN: Dear Alumni, please update your employment or education status through the Alumni Management System. Your response helps the school improve its graduate tracking program. Thank you.'
    );
  }

  res.json({ ok: true, dispatchedCount: dispatched.length, recipients: dispatched });
});

export default router;