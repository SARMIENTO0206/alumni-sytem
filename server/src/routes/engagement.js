import { Router } from 'express';
import { db, findAlumniForUser } from '../db.js';
import { isAdmin, isAlumni, isStaff, ownsLinkedRow, requireRole } from '../auth.js';
import { mirror, mirrorUpdate, mirrorDelete } from '../sync-supabase.js';
import { dispatchAlumniAudience, dispatchNotification, dispatchStaffAudience } from '../notify.js';

const router = Router();

const parseJson = (str, fallback) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return fallback; }
};

function validateEventImageData(imageData) {
  if (imageData === undefined || imageData === null || imageData === '') return { data: '' };
  if (typeof imageData !== 'string') return { error: 'Event image must be a JPG, PNG, or WebP file.' };

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) return { error: 'Event image must be a JPG, PNG, or WebP file.' };

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2]) {
    return { error: 'Event images must be 1 MB or smaller.' };
  }

  const signatures = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  };
  if (!signatures[match[1]]) return { error: 'The uploaded file does not match its image type.' };

  return { data: `data:${match[1]};base64,${match[2]}` };
}

function mirrorEvent(row, update = false) {
  const legacyRow = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'description' && key !== 'image_data')
  );
  if (update) mirrorUpdate('events', legacyRow);
  else mirror('events', legacyRow);
}

const mapEvent = (e) => ({
  id: e.id, title: e.title, date: e.date, location: e.location, rsvps: e.rsvps,
  description: e.description || '',
  imageUrl: e.image_data ? `/api/public/events/${e.id}/image` : '',
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
router.post('/events', requireRole('admin', 'staff'), (req, res) => {
  const { title, date, location, description = '', imageData } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Event title is required.' });
  if (typeof description !== 'string' || description.length > 5000) {
    return res.status(400).json({ error: 'Event description must be 5,000 characters or fewer.' });
  }
  const image = validateEventImageData(imageData);
  if (image.error) return res.status(400).json({ error: image.error });

  const info = db.prepare(
    "INSERT INTO events (title, date, location, description, image_data, rsvps, registered, status, attendees) VALUES (?, ?, ?, ?, ?, 0, 0, 'Upcoming', '[]')"
  ).run(title, date || '', location || '', description.trim(), image.data);

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  dispatchAlumniAudience(`New alumni event: ${title}`, `${title} is scheduled${date ? ` on ${date}` : ''}.`, 'event', row.id).catch(() => {});
  mirrorEvent(row);
  res.status(201).json({ event: mapEvent(row) });
});

router.get('/events/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  res.json({ event: mapEvent(row) });
});

/** POST /api/events/:id/rsvp - register or withdraw the current user only. */
router.post('/events/:id/rsvp', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  const name = String(req.user?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A user profile name is required to register.' });

  const attendees = parseJson(row.attendees, []);
  const idx = attendees.findIndex((a) => String(a.name || '').toLowerCase() === name.toLowerCase());
  if (idx >= 0) {
    attendees.splice(idx, 1);
  } else {
    attendees.push({ name, email: req.user.email || '', present: false });
  }

  db.prepare('UPDATE events SET attendees = ?, rsvps = ?, registered = ? WHERE id = ?').run(
    JSON.stringify(attendees),
    attendees.length,
    attendees.some((a) => String(a.name || '').toLowerCase() === name.toLowerCase()) ? 1 : 0,
    id
  );
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  mirrorEvent(updated, true);
  if (idx < 0) {
    dispatchNotification({
      userId: req.user.id,
      alumniId: req.user.alumniId || 0,
      recipient: req.user.email || name,
      channel: 'SYSTEM',
      subject: 'Event registration confirmed',
      message: `You are registered for ${updated.title}${updated.date ? ` on ${updated.date}` : ''}.`,
      relatedType: 'event',
      relatedId: updated.id,
      email: req.user.email,
      phone: req.user.contact
    }).catch(() => {});
  }
  res.json({ event: mapEvent(updated) });
});

router.post('/events/:id/remind', requireRole('admin', 'staff'), (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  const attendees = parseJson(row.attendees, []);
  if (!attendees.length) return res.status(400).json({ error: 'No registered alumni yet for this event.' });
  let sent = 0;
  for (const attendee of attendees) {
    const user = attendee.email
      ? db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(attendee.email)
      : db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?)').get(attendee.name);
    dispatchNotification({
      userId: user?.id || 0,
      alumniId: user?.alumni_id || 0,
      recipient: attendee.email || attendee.name,
      channel: 'SYSTEM',
      subject: `Event reminder: ${row.title}`,
      message: `${row.title} is coming up${row.date ? ` on ${row.date}` : ''}${row.location ? ` at ${row.location}` : ''}.`,
      relatedType: 'event',
      relatedId: row.id,
      email: attendee.email || user?.email,
      phone: attendee.contact || user?.contact
    }).catch(() => {});
    sent += 1;
  }
  res.json({ ok: true, reminders: sent });
});

router.put('/events/:id/attendance', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });
  const name = String(req.body?.name || '').trim();
  const attendees = parseJson(row.attendees, []);
  const attendee = attendees.find((a) => String(a.name || '').toLowerCase() === name.toLowerCase());
  if (!attendee) return res.status(404).json({ error: 'Attendee not found.' });
  attendee.present = Boolean(req.body?.present);
  db.prepare('UPDATE events SET attendees = ? WHERE id = ?').run(JSON.stringify(attendees), id);
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  mirrorEvent(updated, true);
  res.json({ event: mapEvent(updated) });
});

/** PUT /api/events/:id - edit event (admin). */
router.put('/events/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Event not found.' });
  const { title, date, location, status, description, imageData } = req.body || {};
  if (description !== undefined && (typeof description !== 'string' || description.length > 5000)) {
    return res.status(400).json({ error: 'Event description must be 5,000 characters or fewer.' });
  }
  const image = imageData === undefined ? { data: existing.image_data || '' } : validateEventImageData(imageData);
  if (image.error) return res.status(400).json({ error: image.error });
  db.prepare('UPDATE events SET title = ?, date = ?, location = ?, status = ?, description = ?, image_data = ? WHERE id = ?').run(
    title ?? existing.title, date ?? existing.date, location ?? existing.location, status ?? existing.status,
    description === undefined ? existing.description : description.trim(), image.data, id
  );
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  mirrorEvent(updated, true);
  const cancelled = String(updated.status || '').toLowerCase().includes('cancel');
  const changed = updated.title !== existing.title || updated.date !== existing.date ||
    updated.location !== existing.location || updated.status !== existing.status ||
    updated.description !== existing.description || updated.image_data !== existing.image_data;
  if (cancelled) {
    dispatchAlumniAudience(
      `Event cancelled: ${updated.title}`,
      `${updated.title} has been cancelled.`,
      'event',
      updated.id
    ).catch(() => {});
  } else if (changed) {
    dispatchAlumniAudience(
      `Event update: ${updated.title}`,
      `${updated.title} was updated${updated.date ? ` (${updated.date})` : ''}${updated.location ? ` at ${updated.location}` : ''}.`,
      'event',
      updated.id
    ).catch(() => {});
  }
  res.json({ event: mapEvent(updated) });
});

/** DELETE /api/events/:id - delete event (admin). */
router.delete('/events/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM events WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Event not found.' });
  mirrorDelete('events', id);
  res.status(204).end();
});

/* -------------------------------- Reunions -------------------------------- */

/** GET /api/reunions - list batch reunions. */
router.get('/reunions', (req, res) => {
  const rows = db.prepare('SELECT * FROM reunions ORDER BY id DESC').all();
  res.json({ reunions: rows.map(mapReunion) });
});

/** POST /api/reunions - create a reunion (admin only). */
router.post('/reunions', requireRole('admin', 'staff'), (req, res) => {
  const { batch, date, venue, coordinators } = req.body || {};
  if (!batch) return res.status(400).json({ error: 'Batch label is required.' });

  const info = db.prepare(
    "INSERT INTO reunions (batch, date, venue, coordinators, confirmed, attendees) VALUES (?, ?, ?, ?, 0, '[]')"
  ).run(batch, date || '', venue || '', coordinators || '');

  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(info.lastInsertRowid);
  mirror('reunions', row);
  res.status(201).json({ reunion: mapReunion(row) });
});

router.post('/reunions/:id/rsvp', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Reunion not found.' });
  const name = String(req.user?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A user profile name is required to confirm attendance.' });
  const attendees = parseJson(row.attendees, []);
  const idx = attendees.findIndex((a) => String(a.name || '').toLowerCase() === name.toLowerCase());
  if (idx >= 0) attendees.splice(idx, 1);
  else attendees.push({ name, email: req.user.email || '', confirmed: true, present: false });
  db.prepare('UPDATE reunions SET attendees = ?, confirmed = ? WHERE id = ?').run(
    JSON.stringify(attendees),
    attendees.length ? 1 : 0,
    id
  );
  res.json({ reunion: mapReunion(db.prepare('SELECT * FROM reunions WHERE id = ?').get(id)) });
});

router.put('/reunions/:id/attendance', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Reunion not found.' });
  const name = String(req.body?.name || '').trim();
  const attendees = parseJson(row.attendees, []);
  const attendee = attendees.find((a) => String(a.name || '').toLowerCase() === name.toLowerCase());
  if (!attendee) return res.status(404).json({ error: 'Attendee not found.' });
  attendee.present = Boolean(req.body?.present);
  db.prepare('UPDATE reunions SET attendees = ? WHERE id = ?').run(JSON.stringify(attendees), id);
  const updated = db.prepare('SELECT * FROM reunions WHERE id = ?').get(id);
  mirrorUpdate('reunions', updated);
  res.json({ reunion: mapReunion(updated) });
});

/* -------------------------------- Donations ------------------------------- */

/** GET /api/donations - list donation records. */
router.get('/donations', (req, res) => {
  let rows = db.prepare('SELECT * FROM donations ORDER BY id DESC').all();
  if (isAlumni(req.user)) rows = rows.filter((d) => ownsLinkedRow(req.user, d) || String(d.donor || '').toLowerCase() === String(req.user.name || '').toLowerCase());
  res.json({ donations: rows.map(d => ({ id: d.id, campaign: d.campaign, donor: d.donor, amount: d.amount, date: d.date })) });
});

/** POST /api/donations - staff/admin operational record only. Alumni gifts go through PayMongo checkout. */
router.post('/donations', (req, res) => {
  if (isAlumni(req.user)) {
    return res.status(400).json({ error: 'Donations must be completed through GCash checkout. The amount will be recorded after PayMongo confirms payment.' });
  }
  const { campaign, donor, amount } = req.body || {};
  if (!campaign || amount == null) return res.status(400).json({ error: 'Campaign and amount are required.' });
  const linked = isAlumni(req.user) ? findAlumniForUser(req.user) : null;

  const info = db.prepare(
    'INSERT INTO donations (campaign, donor, amount, date, user_id, alumni_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    campaign,
    donor || req.user.name || 'Anonymous',
    Number(amount),
    new Date().toISOString().split('T')[0],
    isAlumni(req.user) ? req.user.id : 0,
    linked?.id || 0
  );

  const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
  mirror('donations', row);
  res.status(201).json({ donation: { id: row.id, campaign: row.campaign, donor: row.donor, amount: row.amount, date: row.date } });
});

/* ------------------------------- Newsletters ------------------------------ */

/** GET /api/newsletters - list the newsletter archive. */
router.get('/newsletters', (req, res) => {
  const rows = db.prepare('SELECT * FROM newsletters ORDER BY id DESC').all();
  res.json({ newsletters: rows.map(n => ({ id: n.id, subject: n.subject, body: n.body, sentAt: n.sent_at })) });
});

/** POST /api/newsletters - publish a newsletter (admin / registrar). */
router.post('/newsletters', requireRole('admin', 'staff'), (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });

  const info = db.prepare(
    'INSERT INTO newsletters (subject, body, sent_at) VALUES (?, ?, ?)'
  ).run(subject, body || '', new Date().toISOString().split('T')[0]);

  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(info.lastInsertRowid);
  mirror('newsletters', row);
  res.status(201).json({ newsletter: { id: row.id, subject: row.subject, body: row.body, sentAt: row.sent_at } });
});

/* -------------------------------- Feedback -------------------------------- */

/** GET /api/feedback - list survey feedback (admin / registrar). */
router.get('/feedback', (req, res) => {
  let rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC').all();
  if (isAlumni(req.user)) rows = rows.filter((f) => ownsLinkedRow(req.user, f));
  else if (!isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view survey responses.' });
  }
  res.json({ feedback: rows.map(f => ({ id: f.id, name: f.name, rating: f.rating, category: f.category, message: f.message, createdAt: f.created_at })) });
});

/** POST /api/feedback - submit alumni feedback. */
router.post('/feedback', (req, res) => {
  const { name, rating, category, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Feedback message is required.' });
  const linked = isAlumni(req.user) ? findAlumniForUser(req.user) : null;

  const info = db.prepare(
    'INSERT INTO feedback (name, rating, category, message, user_id, alumni_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    name || req.user.name || 'Anonymous',
    Number(rating) || 5,
    category || 'General',
    message,
    isAlumni(req.user) ? req.user.id : 0,
    linked?.id || 0
  );

  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid);
  mirror('feedback', row);
  res.status(201).json({ feedback: { id: row.id, name: row.name, rating: row.rating, category: row.category, message: row.message, createdAt: row.created_at } });
});

/* --------------------------- Job opportunities ---------------------------- */

router.get('/jobs', (req, res) => {
  const rows = db.prepare('SELECT * FROM job_opportunities ORDER BY id DESC').all();
  const visible = (isAdmin(req.user) || isStaff(req.user)) ? rows : rows.filter((j) => j.status === 'Published');
  res.json({ jobs: visible });
});

router.post('/jobs', requireRole('admin', 'staff'), (req, res) => {
  const { title, company, location, description, status } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Job title is required.' });
  const info = db.prepare(
    "INSERT INTO job_opportunities (title, company, location, description, status) VALUES (?, ?, ?, ?, ?)"
  ).run(title, company || '', location || '', description || '', status || 'Published');
  const job = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(info.lastInsertRowid);
  if ((status || 'Published') === 'Published') {
    dispatchAlumniAudience(`New job opportunity: ${title}`, `${title} at ${company || 'an employer'} is now open.`, 'job', job.id).catch(() => {});
  }
  mirror('job_opportunities', job);
  res.status(201).json({ job });
});

router.get('/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job opportunity not found.' });
  if (job.status !== 'Published' && !isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'This job opportunity is not available.' });
  }
  res.json({ job });
});

router.get('/applications', (req, res) => {
  let rows = db.prepare('SELECT * FROM job_applications ORDER BY id DESC').all();
  if (isAlumni(req.user)) {
    rows = rows.filter((r) => ownsLinkedRow(req.user, r));
  } else if (!isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view applications.' });
  }
  res.json({ applications: rows });
});

router.post('/jobs/:id/apply', (req, res) => {
  const jobId = Number(req.params.id) || 0;
  const job = jobId ? db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(jobId) : null;
  const { name, email, resumeName, title, company } = req.body || {};
  const applicant = String(name || req.user?.name || '').trim();
  if (!applicant) return res.status(400).json({ error: 'Applicant name is required.' });
  const linked = isAlumni(req.user) ? findAlumniForUser(req.user) : null;
  const info = db.prepare(
    'INSERT INTO job_applications (job_id, title, company, applicant, email, resume_name, user_id, alumni_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    jobId,
    title || job?.title || '',
    company || job?.company || '',
    applicant,
    email || req.user?.email || '',
    resumeName || '',
    isAlumni(req.user) ? req.user.id : 0,
    linked?.id || 0
  );
  const row = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(info.lastInsertRowid);
  dispatchNotification({
    userId: isAlumni(req.user) ? req.user.id : 0,
    alumniId: linked?.id || 0,
    recipient: email || req.user.email || applicant,
    channel: 'SYSTEM',
    subject: 'Job application received',
    message: `Your application for ${row.title || 'the position'} at ${row.company || 'the employer'} was submitted.`,
    relatedType: 'application',
    relatedId: row.id,
    email: email || req.user.email,
    phone: req.user.contact
  }).catch(() => {});
  dispatchStaffAudience(
    `New job application: ${row.title || 'Position'}`,
    `${applicant} applied for ${row.title || 'a job'}.`,
    'application',
    row.id
  ).catch(() => {});
  mirror('job_applications', row);
  res.status(201).json({ application: row });
});

router.put('/jobs/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Job opportunity not found.' });
  const { title, company, location, description, status } = req.body || {};
  db.prepare(
    'UPDATE job_opportunities SET title = ?, company = ?, location = ?, description = ?, status = ? WHERE id = ?'
  ).run(
    title ?? existing.title,
    company ?? existing.company,
    location ?? existing.location,
    description ?? existing.description,
    status ?? existing.status,
    id
  );
  const job = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(id);
  mirrorUpdate('job_opportunities', job);
  res.json({ job });
});

router.delete('/jobs/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM job_opportunities WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Job opportunity not found.' });
  mirrorDelete('job_opportunities', id);
  res.status(204).end();
});

/* ----------------------------- Announcements ------------------------------ */

router.get('/announcements', (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  const visible = (isAdmin(req.user) || isStaff(req.user)) ? rows : rows.filter((a) => a.status === 'Published');
  res.json({ announcements: visible });
});

router.post('/announcements', requireRole('admin', 'staff'), (req, res) => {
  const { title, body, status, audience } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
  const info = db.prepare('INSERT INTO announcements (title, body, status, audience) VALUES (?, ?, ?, ?)').run(
    title, body || '', status || 'Published', audience || 'alumni'
  );
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
  if ((status || 'Published') === 'Published') {
    dispatchAlumniAudience(title, body || 'A new announcement was published.', 'announcement', announcement.id).catch(() => {});
  }
  res.status(201).json({ announcement });
});

router.get('/announcements/:id', (req, res) => {
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(req.params.id));
  if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
  if (announcement.status !== 'Published' && !isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'This announcement is not available.' });
  }
  res.json({ announcement });
});

router.post('/surveys/invite', requireRole('admin', 'staff'), (req, res) => {
  const subject = req.body?.subject || 'Survey invitation';
  const message = req.body?.message || 'Please complete the alumni survey in the portal.';
  dispatchAlumniAudience(subject, message, 'survey', req.body?.relatedId || '').catch(() => {});
  res.status(201).json({ ok: true });
});

export default router;
