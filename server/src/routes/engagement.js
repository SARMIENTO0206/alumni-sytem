import { Router } from 'express';
import { db, findAlumniForUser, getSetting, setSetting, writeAudit } from '../db.js';
import { isAdmin, isAlumni, isStaff, ownsLinkedRow, requireRole } from '../auth.js';
import { mirror, mirrorUpdate, mirrorDelete } from '../sync-supabase.js';
import { dispatchAlumniAudience, dispatchNotification, dispatchStaffAudience } from '../notify.js';
import { normalizePhMobile } from '../phone.js';

const router = Router();

const parseJson = (str, fallback) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return fallback; }
};

function validateJobInput(input, existing = {}) {
  const field = (key) => String(input[key] ?? existing[key] ?? '').trim();
  const title = field('title');
  if (!title) return { error: 'Job title is required.' };
  if (!field('company')) return { error: 'Company or employer is required.' };
  if (!field('location')) return { error: 'Job location is required.' };
  if (!field('industry')) return { error: 'Job industry is required.' };
  if (!field('employment_type')) return { error: 'Employment type is required.' };
  if (!field('description')) return { error: 'Job description is required.' };
  const status = field('status') || 'Published';
  if (!['Draft', 'Published', 'Archived'].includes(status)) {
    return { error: 'Choose Draft, Published, or Archived for the job status.' };
  }
  const applicationMethod = field('application_method') || 'Portal';
  if (!['Portal', 'Link', 'Email', 'Contact Information'].includes(applicationMethod)) {
    return { error: 'Choose a valid application method.' };
  }
  if (applicationMethod !== 'Portal' && !field('application_details')) {
    return { error: 'Application details are required for the selected method.' };
  }
  if (applicationMethod === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('application_details'))) {
    return { error: 'Enter a valid employer email address.' };
  }
  const deadline = field('deadline');
  if (deadline && !isValidIsoDate(deadline)) return { error: 'Enter a valid application deadline.' };
  const applicationDetails = field('application_details');
  if (applicationMethod === 'Link' && applicationDetails) {
    try {
      if (new URL(applicationDetails).protocol !== 'https:') throw new Error();
    } catch {
      return { error: 'Application links must use a valid HTTPS URL.' };
    }
  }
  if (applicationDetails.length > 1000) return { error: 'Application details must be 1,000 characters or fewer.' };
  const notification = (key, fallback) => input[key] === undefined
    ? Boolean(Number(existing[key] ?? Number(fallback)))
    : input[key] === true;
  return {
    notifyInApp: notification('notify_in_app', true),
    notifyEmail: notification('notify_email', false),
    values: [
      title,
      field('company'),
      field('location'),
      field('description'),
      status,
      field('industry'),
      field('employment_type'),
      field('qualifications'),
      applicationMethod,
      applicationDetails,
      deadline
    ]
  };
}

function jobIsExpired(job) {
  return Boolean(job.deadline && job.deadline < new Date().toISOString().slice(0, 10));
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

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
  educationLevel: r.education_level || '', batchYear: r.batch_year || '', strand: r.strand || '',
  title: r.title || r.batch || '', startTime: r.start_time || '', endTime: r.end_time || '',
  description: r.description || '', coordinatorName: r.coordinator_name || '',
  coordinatorContact: r.coordinator_contact || '', rsvpEnabled: r.rsvp_enabled !== 0,
  rsvpDeadline: r.rsvp_deadline || '', sendEmail: r.invitation_email !== 0,
  sendSms: r.invitation_sms !== 0, status: r.status || 'Published',
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

function reunionAudience(educationLevel, batchYear, strand = '') {
  let sql = `SELECT id, alumni_id, name, email, contact
    FROM users
    WHERE role = 'alumni' AND status = 'Active' AND education_level = ?`;
  const params = [educationLevel];
  if (batchYear) {
    sql += ' AND batch = ?';
    params.push(String(batchYear));
  }
  if (strand) {
    if (strand === 'TVL') {
      sql += " AND (track = 'TVL' OR strand = 'TVL')";
    } else {
      sql += ' AND strand = ?';
      params.push(strand);
    }
  }
  return db.prepare(sql).all(...params);
}

function reunionCounts(users) {
  return {
    eligible: users.length,
    withEmail: users.filter((user) => String(user.email || '').trim()).length,
    withMobile: users.filter((user) => String(user.contact || '').trim()).length
  };
}

function mirrorReunion(row, update = false) {
  const legacyRow = Object.fromEntries(
    Object.entries(row).filter(([key]) => ![
      'education_level', 'batch_year', 'strand', 'title', 'start_time', 'end_time',
      'description', 'coordinator_name', 'coordinator_contact', 'rsvp_enabled',
      'rsvp_deadline', 'invitation_email', 'invitation_sms', 'status'
    ].includes(key))
  );
  if (update) mirrorUpdate('reunions', legacyRow);
  else mirror('reunions', legacyRow);
}

/** GET /api/reunions - list batch reunions. */
router.get('/reunions', (req, res) => {
  const rows = db.prepare('SELECT * FROM reunions ORDER BY id DESC').all();
  const visibleRows = isAdmin(req.user) || isStaff(req.user)
    ? rows
    : rows.filter((row) => (row.status || 'Published') === 'Published');
  res.json({ reunions: visibleRows.map(mapReunion) });
});

router.get('/reunions/target-options', requireRole('admin', 'staff'), (req, res) => {
  const educationLevel = String(req.query.educationLevel || '');
  if (!['JHS', 'SHS'].includes(educationLevel)) {
    return res.status(400).json({ error: 'Select Junior High School or Senior High School.' });
  }
  const batchRows = db.prepare(
    `SELECT DISTINCT batch FROM users
     WHERE role = 'alumni' AND status = 'Active' AND education_level = ?
       AND batch GLOB '[0-9][0-9][0-9][0-9]'
     ORDER BY CAST(batch AS INTEGER) DESC`
  ).all(educationLevel);
  const years = batchRows.map((row) => row.batch);
  const strands = educationLevel === 'SHS'
    ? [...new Set([
      'STEM', 'ABM', 'HUMSS', 'GAS', 'TVL',
      ...db.prepare(
        `SELECT DISTINCT strand FROM users
         WHERE role = 'alumni' AND status = 'Active' AND education_level = 'SHS'
           AND TRIM(strand) != ''
         ORDER BY strand`
      ).all().map((row) => row.strand)
    ])]
    : [];

  const batchYear = String(req.query.batchYear || '');
  const strand = String(req.query.strand || '');
  const selectedBatchIsValid = !batchYear || years.includes(batchYear);
  const selectedStrandIsValid = !strand || (educationLevel === 'SHS' && strands.includes(strand));
  if (!selectedBatchIsValid || !selectedStrandIsValid) {
    return res.status(400).json({ error: 'Select a valid target batch and strand.' });
  }
  const counts = batchYear
    ? reunionCounts(reunionAudience(educationLevel, batchYear, strand))
    : { eligible: 0, withEmail: 0, withMobile: 0 };
  res.json({ years, strands, counts });
});

/** POST /api/reunions - save a draft or create a reunion and send selected invitations. */
router.post('/reunions', requireRole('admin', 'staff'), async (req, res) => {
  const body = req.body || {};
  const status = body.sendInvitations === true ? 'Published' : 'Draft';
  const title = String(body.title || '').trim();
  const educationLevel = String(body.educationLevel || '');
  const batchYear = String(body.batchYear || '');
  const strand = String(body.strand || '');
  const date = String(body.date || '');
  const startTime = String(body.startTime || '');
  const endTime = String(body.endTime || '');
  const venue = String(body.venue || '').trim();
  const description = String(body.description || '').trim();
  const coordinatorName = String(body.coordinatorName || '').trim();
  const coordinatorContactRaw = String(body.coordinatorContact || '').trim();
  const rsvpEnabled = body.rsvpEnabled !== false;
  const rsvpDeadline = String(body.rsvpDeadline || '');
  const sendEmail = body.sendEmail === true;
  const sendSms = body.sendSms === true;

  if (title.length > 160 || description.length > 5000 || venue.length > 240 || coordinatorName.length > 120) {
    return res.status(400).json({ error: 'A reunion field exceeds its maximum length.' });
  }
  let coordinatorContact = '';
  try {
    coordinatorContact = normalizePhMobile(coordinatorContactRaw);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  let audience = [];
  if (status === 'Published') {
    if (!title || !['JHS', 'SHS'].includes(educationLevel) ||
        !/^\d{4}$/.test(batchYear) || Number(batchYear) < 1960 ||
        Number(batchYear) > new Date().getFullYear()) {
      return res.status(400).json({ error: 'Enter a reunion title, education level, and valid target batch year.' });
    }
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: 'Select a valid reunion date.' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
        (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) ||
        (endTime && endTime <= startTime)) {
      return res.status(400).json({ error: 'Enter a valid start time and an end time later than the start time.' });
    }
    if (!venue) return res.status(400).json({ error: 'Venue / location is required.' });
    if (rsvpDeadline && (!isValidIsoDate(rsvpDeadline) ||
        rsvpDeadline > date)) {
      return res.status(400).json({ error: 'RSVP deadline must be a valid date on or before the reunion date.' });
    }
    const strandExists = educationLevel === 'SHS' && Boolean(db.prepare(
      `SELECT id FROM users WHERE role = 'alumni' AND status = 'Active'
       AND education_level = 'SHS' AND batch = ? AND strand = ? LIMIT 1`
    ).get(batchYear, strand));
    if (strand && (educationLevel !== 'SHS' ||
        (!['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL'].includes(strand) && !strandExists))) {
      return res.status(400).json({ error: 'Select a valid SHS strand or All Strands.' });
    }
    if (!sendEmail && !sendSms) {
      return res.status(400).json({ error: 'Select at least one invitation channel.' });
    }
    audience = reunionAudience(educationLevel, batchYear, strand);
    if (!audience.length) {
      return res.status(400).json({ error: 'No active alumni match the selected education level, batch, and strand.' });
    }
    const canReceiveSelectedChannel = audience.some((user) =>
      (sendEmail && String(user.email || '').trim()) ||
      (sendSms && String(user.contact || '').trim())
    );
    if (!canReceiveSelectedChannel) {
      return res.status(400).json({ error: 'No alumni in this target group have contact details for the selected invitation channels.' });
    }
  }
  const batchLabel = title
    ? `${title} (${educationLevel || 'Alumni'} Batch ${batchYear || 'TBD'}${strand ? ` • ${strand}` : ''})`
    : `Batch Reunion${batchYear ? ` (${batchYear})` : ''}`;
  const legacyCoordinator = coordinatorName
    ? `${coordinatorName}${coordinatorContact ? ` (${coordinatorContact})` : ''}`
    : coordinatorContact;

  const values = [
    batchLabel, date, venue, legacyCoordinator, educationLevel, batchYear, strand, title,
    startTime, endTime, description, coordinatorName, coordinatorContact,
    rsvpEnabled ? 1 : 0, rsvpDeadline, sendEmail ? 1 : 0, sendSms ? 1 : 0, status
  ];
  const reunionId = Number(body.reunionId || 0);
  let row;
  if (reunionId) {
    const existingDraft = db.prepare('SELECT * FROM reunions WHERE id = ?').get(reunionId);
    if (!existingDraft || (existingDraft.status || 'Published') !== 'Draft') {
      return res.status(404).json({ error: 'Reunion draft not found.' });
    }
    db.prepare(
      `UPDATE reunions SET batch = ?, date = ?, venue = ?, coordinators = ?, education_level = ?,
       batch_year = ?, strand = ?, title = ?, start_time = ?, end_time = ?, description = ?,
       coordinator_name = ?, coordinator_contact = ?, rsvp_enabled = ?, rsvp_deadline = ?,
       invitation_email = ?, invitation_sms = ?, status = ?
       WHERE id = ?`
    ).run(...values, reunionId);
    row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(reunionId);
  } else {
    const info = db.prepare(
      `INSERT INTO reunions
        (batch, date, venue, coordinators, confirmed, attendees, education_level, batch_year, strand,
         title, start_time, end_time, description, coordinator_name, coordinator_contact,
         rsvp_enabled, rsvp_deadline, invitation_email, invitation_sms, status)
       VALUES (?, ?, ?, ?, 0, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...values);
    row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(info.lastInsertRowid);
  }

  if (status === 'Draft') return res.status(201).json({ reunion: mapReunion(row) });
  mirrorReunion(row, Boolean(reunionId));

  const invitationMessage = [
    `${title} is scheduled for ${date}${startTime ? ` at ${startTime}` : ''}${endTime ? `–${endTime}` : ''}.`,
    `Venue: ${venue}.`,
    rsvpEnabled ? `Please RSVP${rsvpDeadline ? ` by ${rsvpDeadline}` : ''} in the alumni portal.` : '',
    description
  ].filter(Boolean).join(' ');
  const deliveries = await Promise.all(audience.map((user) => dispatchNotification({
    userId: user.id,
    alumniId: user.alumni_id || 0,
    recipient: String(user.email || '').trim() || user.name,
    channel: 'SYSTEM',
    subject: `Reunion invitation: ${title}`,
    message: invitationMessage,
    relatedType: 'reunion',
    relatedId: row.id,
    email: String(user.email || '').trim(),
    phone: String(user.contact || '').trim(),
    sendEmail: sendEmail && Boolean(String(user.email || '').trim()),
    sendSms: sendSms && Boolean(String(user.contact || '').trim()),
    forceChannels: true
  })));
  const invitationCounts = {
    ...reunionCounts(audience),
    emailSent: deliveries.filter((item) => item?.emailStatus === 'accepted').length,
    smsSent: deliveries.filter((item) => item?.smsStatus === 'accepted').length
  };
  res.status(201).json({ reunion: mapReunion(row), invitations: invitationCounts });
});

router.post('/reunions/:id/rsvp', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Reunion not found.' });
  if ((row.status || 'Published') !== 'Published') {
    return res.status(403).json({ error: 'This reunion is still a draft.' });
  }
  if (!row.rsvp_enabled) return res.status(403).json({ error: 'RSVP is disabled for this reunion.' });
  if (row.rsvp_deadline && row.rsvp_deadline < new Date().toISOString().slice(0, 10)) {
    return res.status(403).json({ error: 'The RSVP deadline has passed.' });
  }
  const name = String(req.user?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A user profile name is required to confirm attendance.' });
  if (req.user?.role === 'alumni' &&
      (req.user.status !== 'Active' ||
       req.user.educationLevel !== row.education_level ||
       String(req.user.batch) !== String(row.batch_year) ||
       (row.strand && (row.strand === 'TVL' ? req.user.track !== 'TVL' : req.user.strand !== row.strand)))) {
    return res.status(403).json({ error: 'This reunion is not available for your verified alumni batch.' });
  }
  const attendees = parseJson(row.attendees, []);
  const idx = attendees.findIndex((a) => String(a.name || '').toLowerCase() === name.toLowerCase());
  if (idx >= 0) attendees.splice(idx, 1);
  else attendees.push({ name, email: req.user.email || '', confirmed: true, present: false });
  db.prepare('UPDATE reunions SET attendees = ?, confirmed = ? WHERE id = ?').run(
    JSON.stringify(attendees),
    attendees.length ? 1 : 0,
    id
  );
  const updated = db.prepare('SELECT * FROM reunions WHERE id = ?').get(id);
  mirrorReunion(updated, true);
  res.json({ reunion: mapReunion(updated) });
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
  mirrorReunion(updated, true);
  res.json({ reunion: mapReunion(updated) });
});

/* -------------------------------- Donations ------------------------------- */

const DEFAULT_DONATION_CAMPAIGN = {
  title: 'Campus Chapel & Library Modernization',
  description: 'Support the enhancement of our school chapel and research library facilities. Every donation contributes directly to student learning resources and campus upgrades.',
  goal: 200000,
  status: 'Active',
  startDate: '2026-09-01',
  endDate: '2026-12-31'
};

function getDonationCampaign() {
  const saved = getSetting('donation_campaign', {});
  return { ...DEFAULT_DONATION_CAMPAIGN, ...(saved && typeof saved === 'object' ? saved : {}) };
}

function publicDonation(row, status = row.payment_status || 'recorded') {
  const anonymous = Boolean(row.is_anonymous);
  return {
    id: row.id,
    campaign: row.campaign || '',
    donor: anonymous ? 'Anonymous' : (row.account_name || row.alumni_name || row.donor || 'Donor'),
    amount: Number(row.amount || 0),
    date: row.date || '',
    paymentStatus: status,
    paymentRef: row.payment_ref || '',
    dedication: row.dedication || '',
    anonymous,
    userId: row.user_id || 0,
    studentId: row.student_id || row.alumni_student_id || '',
    educationLevel: row.education_level || '',
    batch: row.user_batch || row.alumni_batch || row.education_year || '',
    strand: row.strand || '',
    identityMatched: Boolean(row.alumni_record_id),
    internalDonor: row.account_name || row.alumni_name || row.donor || 'Donor'
  };
}

router.get('/donation-campaign', (req, res) => {
  const campaign = getDonationCampaign();
  const paidRows = db.prepare(
    "SELECT id, user_id, donor, amount FROM donations WHERE payment_status = 'paid' AND campaign IN (?, 'Alumni Foundation')"
  ).all(campaign.title);
  const donors = new Set(paidRows.map((row) => row.user_id
    ? `user:${row.user_id}`
    : `record:${row.id}:${String(row.donor || '').toLowerCase()}`));
  const raised = paidRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  res.json({ campaign, metrics: { raised, donors: donors.size } });
});

router.put('/donation-campaign', requireRole('admin'), (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const goal = Number(body.goal);
  const status = String(body.status || '');
  const startDate = String(body.startDate || '');
  const endDate = String(body.endDate || '');

  if (!title || title.length > 160) {
    return res.status(400).json({ error: 'Campaign title is required and must be 160 characters or fewer.' });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: 'Campaign description must be 2,000 characters or fewer.' });
  }
  if (!Number.isSafeInteger(goal) || goal < 1 || goal > 100000000) {
    return res.status(400).json({ error: 'Campaign goal must be between PHP 1 and PHP 100,000,000.' });
  }
  if (!['Draft', 'Active', 'Closed'].includes(status)) {
    return res.status(400).json({ error: 'Campaign status must be Draft, Active, or Closed.' });
  }
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
    return res.status(400).json({ error: 'Enter valid campaign dates; the end date must be on or after the start date.' });
  }

  const campaign = { title, description, goal, status, startDate, endDate };
  setSetting('donation_campaign', campaign);
  res.json({ campaign });
});

/** GET /api/donations - list donation records. */
router.get('/donations', (req, res) => {
  if (!isAdmin(req.user) && !isStaff(req.user) && !isAlumni(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view donation records.' });
  }
  const donationRows = db.prepare(`
    SELECT d.*, u.name AS account_name, u.student_id, u.batch AS user_batch,
      u.education_level, u.strand, a.id AS alumni_record_id, a.name AS alumni_name,
      a.batch AS alumni_batch, a.student_id AS alumni_student_id, a.education_year
    FROM donations d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN alumni a ON a.id = d.alumni_id
    ORDER BY d.id DESC
  `).all();
  let donations = donationRows.map((row) => publicDonation(row));

  const pendingRows = db.prepare(`
    SELECT p.id, p.user_id, p.alumni_id, p.amount_centavos, p.status, p.created_at,
      p.reference_id, p.metadata, u.name AS account_name, u.student_id,
      u.batch AS user_batch, u.education_level, u.strand, a.id AS alumni_record_id,
      a.name AS alumni_name, a.batch AS alumni_batch, a.student_id AS alumni_student_id,
      a.education_year
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN alumni a ON a.id = p.alumni_id
    WHERE p.related_type = 'donation' AND p.status IN ('pending', 'awaiting_payment', 'processing')
    ORDER BY p.id DESC
  `).all();
  if (isAdmin(req.user)) {
    donations = donations.concat(pendingRows.map((row) => {
      const metadata = parseJson(row.metadata, {});
      return {
        ...publicDonation({
          ...row,
          id: `payment-${row.id}`,
          campaign: metadata.campaign || '',
          amount: Number(row.amount_centavos || 0) / 100,
          date: String(row.created_at || '').slice(0, 10),
          payment_ref: row.reference_id || '',
          dedication: metadata.dedication || '',
          is_anonymous: metadata.anonymous ? 1 : 0
        }, 'pending'),
        id: `payment-${row.id}`,
        paymentId: row.id
      };
    }));
  } else if (isAlumni(req.user)) {
    donations = donations.filter((donation) => donation.userId === req.user.id);
    donations = donations.concat(pendingRows
      .filter((row) => Number(row.user_id) === Number(req.user.id))
      .map((row) => {
        const metadata = parseJson(row.metadata, {});
        return {
          ...publicDonation({
            ...row,
            id: `payment-${row.id}`,
            campaign: metadata.campaign || '',
            amount: Number(row.amount_centavos || 0) / 100,
            date: String(row.created_at || '').slice(0, 10),
            payment_ref: row.reference_id || '',
            dedication: metadata.dedication || '',
            is_anonymous: metadata.anonymous ? 1 : 0
          }, 'pending'),
          id: `payment-${row.id}`,
          paymentId: row.id
        };
      }));
  } else if (isStaff(req.user)) {
    donations = donations.map(({ paymentStatus, paymentRef, dedication, anonymous, ...donation }) => donation);
  }
  res.json({ donations });
});

/** POST /api/donations - staff/admin operational record only. Alumni gifts go through PayMongo checkout. */
router.post('/donations', requireRole('admin'), (req, res) => {
  const { campaign, donor, amount } = req.body || {};
  if (!campaign || amount == null) return res.status(400).json({ error: 'Campaign and amount are required.' });

  const info = db.prepare(
    'INSERT INTO donations (campaign, donor, amount, date, user_id, alumni_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    campaign,
    donor || req.user.name || 'Anonymous',
    Number(amount),
    new Date().toISOString().split('T')[0],
    0,
    0
  );

  const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
  mirror('donations', Object.fromEntries(Object.entries(row).filter(([key]) =>
    !['payment_status', 'payment_ref', 'dedication', 'is_anonymous'].includes(key)
  )));
  res.status(201).json({ donation: { id: row.id, campaign: row.campaign, donor: row.donor, amount: row.amount, date: row.date } });
});

/* ------------------------------- Newsletters ------------------------------ */

function mapNewsletter(row) {
  return {
    id: row.id,
    title: row.title || row.subject,
    subject: row.subject,
    body: row.body,
    status: row.status || 'Published',
    sentAt: row.sent_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    createdByRole: row.created_by_role || '',
    submittedAt: row.submitted_at || '',
    reviewedBy: row.reviewed_by || '',
    reviewNote: row.review_note || '',
    sendInApp: Boolean(row.send_in_app),
    sendEmail: Boolean(row.send_email),
    sendSms: Boolean(row.send_sms),
    inAppDelivered: Number(row.in_app_delivered || 0),
    emailSent: Number(row.email_sent || 0),
    smsSent: Number(row.sms_sent || 0),
    deliveryFailed: Number(row.delivery_failed || 0)
  };
}

function validateNewsletter(input, existing = {}) {
  const field = (key) => String(input[key] ?? existing[key] ?? '').trim();
  const title = field('title');
  const subject = field('subject');
  const body = field('body');
  if (!title) return { error: 'Newsletter title is required.' };
  if (!subject) return { error: 'Email subject is required.' };
  if (!body) return { error: 'Newsletter content is required.' };
  if (title.length > 160 || subject.length > 200 || body.length > 20000) {
    return { error: 'A newsletter field exceeds its maximum length.' };
  }
  const result = {
    title,
    subject,
    body,
    sendInApp: input.sendInApp === undefined ? Boolean(existing.send_in_app ?? 1) : input.sendInApp === true,
    sendEmail: input.sendEmail === undefined ? Boolean(existing.send_email ?? 1) : input.sendEmail === true,
    sendSms: input.sendSms === undefined ? Boolean(existing.send_sms ?? 0) : input.sendSms === true
  };
  if (!result.sendInApp && !result.sendEmail && !result.sendSms) {
    return { error: 'Select at least one notification channel.' };
  }
  return result;
}

function newsletterDeliverySummary(results) {
  return results.reduce((summary, result) => {
    if (['sent', 'accepted', 'delivered'].includes(result.email_status)) summary.emailSent++;
    if (['sent', 'accepted', 'delivered'].includes(result.sms_status)) summary.smsSent++;
    if (['failed', 'not_configured'].includes(result.email_status) || ['failed', 'not_configured'].includes(result.sms_status)) {
      summary.failed++;
    }
    return summary;
  }, { emailSent: 0, smsSent: 0, failed: 0 });
}

async function publishNewsletter(row) {
  const audience = db.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'alumni' AND (status IS NULL OR status = 'Active')"
  ).get().count;
  const shortMessage = `The ${row.title || row.subject} is now available. Log in to the Alumni Portal to read the latest school and alumni updates.`;
  let results = [];
  let deliveryError = '';
  try {
    results = await dispatchAlumniAudience(
      `New alumni newsletter: ${row.title || row.subject}`,
      shortMessage,
      'newsletter',
      row.id,
      {
        inApp: Boolean(row.send_in_app),
        sendEmail: Boolean(row.send_email),
        sendSms: Boolean(row.send_sms),
        forceChannels: true,
        emailSubject: row.subject,
        emailMessage: `${row.body}\n\nLog in to the Alumni Portal to view the newsletter archive.`,
        smsMessage: `St. Agnes Alumni: ${row.title || row.subject} is now available. Log in to the Alumni Portal to read the latest school and alumni updates.`
      }
    );
  } catch (error) {
    deliveryError = 'Newsletter published, but one or more delivery channels failed.';
    console.error(`Unable to deliver newsletter ${row.id}:`, error);
  }
  const delivery = newsletterDeliverySummary(results);
  const inAppDelivered = row.send_in_app
    ? Number(db.prepare(
        "SELECT COUNT(DISTINCT user_id) AS count FROM notifications WHERE related_type = 'newsletter' AND related_id = ?"
      ).get(String(row.id)).count)
    : 0;
  if (row.send_in_app) delivery.failed += Math.max(0, audience - inAppDelivered);
  db.prepare(
    'UPDATE newsletters SET in_app_delivered = ?, email_sent = ?, sms_sent = ?, delivery_failed = ? WHERE id = ?'
  ).run(inAppDelivered, delivery.emailSent, delivery.smsSent, delivery.failed, row.id);
  const updated = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(row.id);
  mirrorUpdate('newsletters', updated);
  return {
    newsletter: mapNewsletter(updated),
    delivery: { audience, inAppDelivered, ...delivery, error: deliveryError }
  };
}

/** Admin/staff see workflow items; Alumni only see published editions. */
router.get('/newsletters', (req, res) => {
  const rows = (isAdmin(req.user) || isStaff(req.user))
    ? db.prepare('SELECT * FROM newsletters ORDER BY id DESC').all()
    : db.prepare("SELECT * FROM newsletters WHERE status = 'Published' ORDER BY id DESC").all();
  res.json({ newsletters: rows.map(mapNewsletter) });
});

/** Admin and Registrar can create drafts; publishing requires a separate Admin approval action. */
router.post('/newsletters', requireRole('admin', 'staff'), (req, res) => {
  const input = validateNewsletter(req.body || {});
  if (input.error) return res.status(400).json({ error: input.error });
  const info = db.prepare(`
    INSERT INTO newsletters (
      title, subject, body, status, created_by, created_by_name, created_by_role,
      send_in_app, send_email, send_sms
    ) VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?)
  `).run(
    input.title, input.subject, input.body, req.user.id, req.user.name || '',
    req.user.role, input.sendInApp ? 1 : 0, input.sendEmail ? 1 : 0, input.sendSms ? 1 : 0
  );
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(info.lastInsertRowid);
  mirror('newsletters', row);
  writeAudit(req.user, 'create', 'newsletter', row.id, `Draft: ${row.title}`);
  res.status(201).json({ newsletter: mapNewsletter(row) });
});

/** Update only drafts or returned editions; staff may only edit their own. */
router.put('/newsletters/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Newsletter not found.' });
  if (existing.status !== 'Draft' && existing.status !== 'Changes Requested') {
    return res.status(409).json({ error: 'Only drafts and returned newsletters can be edited.' });
  }
  if (isStaff(req.user) && Number(existing.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'You can only edit newsletters you created.' });
  }
  const input = validateNewsletter(req.body || {}, existing);
  if (input.error) return res.status(400).json({ error: input.error });
  db.prepare(`
    UPDATE newsletters
    SET title = ?, subject = ?, body = ?, send_in_app = ?, send_email = ?, send_sms = ?, review_note = ''
    WHERE id = ?
  `).run(input.title, input.subject, input.body, input.sendInApp ? 1 : 0, input.sendEmail ? 1 : 0, input.sendSms ? 1 : 0, id);
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  mirrorUpdate('newsletters', row);
  writeAudit(req.user, 'update', 'newsletter', row.id, `Draft: ${row.title}`);
  res.json({ newsletter: mapNewsletter(row) });
});

router.post('/newsletters/:id/submit', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Newsletter not found.' });
  if (isStaff(req.user) && Number(row.created_by) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'You can only submit newsletters you created.' });
  }
  if (row.status !== 'Draft' && row.status !== 'Changes Requested') {
    return res.status(409).json({ error: 'Only drafts or returned newsletters can be submitted for approval.' });
  }
  db.prepare("UPDATE newsletters SET status = 'For Approval', submitted_at = ?, review_note = '' WHERE id = ?")
    .run(new Date().toISOString(), id);
  const submitted = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  mirrorUpdate('newsletters', submitted);
  writeAudit(req.user, 'submit', 'newsletter', id, submitted.title);
  res.json({ newsletter: mapNewsletter(submitted) });
});

router.post('/newsletters/:id/return', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Newsletter not found.' });
  if (row.status !== 'For Approval') return res.status(409).json({ error: 'Only newsletters awaiting approval can be returned.' });
  const note = String(req.body?.note || '').trim();
  if (!note || note.length > 1000) return res.status(400).json({ error: 'Provide an editing note of up to 1,000 characters.' });
  db.prepare("UPDATE newsletters SET status = 'Changes Requested', reviewed_by = ?, review_note = ? WHERE id = ?")
    .run(req.user.name || '', note, id);
  const returned = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  mirrorUpdate('newsletters', returned);
  writeAudit(req.user, 'return', 'newsletter', id, note);
  res.json({ newsletter: mapNewsletter(returned) });
});

router.post('/newsletters/:id/approve', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Newsletter not found.' });
  if (row.status !== 'For Approval') return res.status(409).json({ error: 'Only newsletters awaiting approval can be published.' });
  db.prepare("UPDATE newsletters SET status = 'Published', sent_at = ?, reviewed_by = ?, review_note = '' WHERE id = ?")
    .run(new Date().toISOString(), req.user.name || '', id);
  writeAudit(req.user, 'publish', 'newsletter', id, row.title || row.subject);
  const published = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  const result = await publishNewsletter(published);
  res.json(result);
});

router.post('/newsletters/:id/archive', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Newsletter not found.' });
  if (row.status !== 'Published') return res.status(409).json({ error: 'Only published newsletters can be archived.' });
  db.prepare("UPDATE newsletters SET status = 'Archived' WHERE id = ?").run(id);
  const archived = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  mirrorUpdate('newsletters', archived);
  writeAudit(req.user, 'archive', 'newsletter', id, archived.title || archived.subject);
  res.json({ newsletter: mapNewsletter(archived) });
});

/* -------------------------------- Feedback -------------------------------- */

const FEEDBACK_CATEGORIES = new Set([
  'Alumni Services',
  'Registrar / Document Requests',
  'Alumni Events & Reunions',
  'Alumni Portal/System',
  'Career & Graduate Services',
  'School Programs & Activities',
  'Facilities',
  'Communication / Newsletter',
  'Other',
  'Alumni Records'
]);

const REGISTRAR_FEEDBACK_CATEGORIES = new Set([
  'Alumni Services',
  'Registrar / Document Requests',
  'Alumni Records',
  'Career & Graduate Services'
]);

function feedbackRowForClient(row, includeStaffFields) {
  const record = {
    id: row.id,
    name: row.account_name || row.alumni_name || row.name || 'Alumni',
    educationLevel: row.education_level || '',
    batch: row.user_batch || row.alumni_batch || row.education_year || '',
    category: row.category || 'Other',
    rating: Number(row.rating || 0),
    recommendationRating: row.recommendation_rating == null ? null : Number(row.recommendation_rating),
    improvement: row.improvement || '',
    message: row.message || '',
    contactRequested: Boolean(row.contact_requested),
    createdAt: row.created_at || ''
  };
  if (includeStaffFields) {
    record.status = row.status || 'New';
    record.internalNote = row.internal_note || '';
  }
  return record;
}

/** GET /api/feedback - alumni can see their own submissions; staff see routed records. */
router.get('/feedback', (req, res) => {
  if (!isAlumni(req.user) && !isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view survey responses.' });
  }
  const rows = db.prepare(`
    SELECT f.*, u.name AS account_name, u.education_level, u.batch AS user_batch,
      a.name AS alumni_name, a.batch AS alumni_batch, a.education_year
    FROM feedback f
    LEFT JOIN users u ON u.id = f.user_id
    LEFT JOIN alumni a ON a.id = f.alumni_id
    ORDER BY f.id DESC
  `).all();
  const visible = isAlumni(req.user)
    ? rows.filter((row) => ownsLinkedRow(req.user, row))
    : isStaff(req.user)
      ? rows.filter((row) => REGISTRAR_FEEDBACK_CATEGORIES.has(row.category))
      : rows;
  res.json({
    feedback: visible.map((row) => feedbackRowForClient(row, !isAlumni(req.user)))
  });
});

/** POST /api/feedback - submit alumni feedback. */
router.post('/feedback', requireRole('alumni'), (req, res) => {
  const { rating, recommendationRating, category, message, improvement, contactRequested } = req.body || {};
  const satisfaction = Number(rating);
  const recommendation = Number(recommendationRating);
  const cleanMessage = String(message || '').trim();
  const cleanImprovement = String(improvement || '').trim();
  if (!FEEDBACK_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Choose a valid feedback category.' });
  }
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
    return res.status(400).json({ error: 'Overall satisfaction must be between 1 and 5.' });
  }
  if (recommendationRating === undefined || recommendationRating === null || recommendationRating === '' ||
      !Number.isInteger(recommendation) || recommendation < 0 || recommendation > 10) {
    return res.status(400).json({ error: 'Recommendation score must be between 0 and 10.' });
  }
  if (!cleanMessage || cleanMessage.length > 5000 || cleanImprovement.length > 2000) {
    return res.status(400).json({ error: 'Feedback is required and must be 5,000 characters or fewer; suggestions must be 2,000 characters or fewer.' });
  }
  const linked = findAlumniForUser(req.user);

  const info = db.prepare(
    `INSERT INTO feedback (
      name, rating, category, message, user_id, alumni_id,
      recommendation_rating, improvement, contact_requested, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`
  ).run(
    req.user.name || 'Alumni',
    satisfaction,
    category,
    cleanMessage,
    req.user.id,
    linked?.id || 0,
    recommendation,
    cleanImprovement,
    contactRequested === true ? 1 : 0
  );

  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid);
  mirror('feedback', Object.fromEntries(Object.entries(row).filter(([key]) =>
    !['recommendation_rating', 'improvement', 'contact_requested', 'status', 'internal_note'].includes(key)
  )));
  res.status(201).json({ feedback: feedbackRowForClient(row, false) });
});

router.put('/feedback/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Feedback response not found.' });
  if (isStaff(req.user) && !REGISTRAR_FEEDBACK_CATEGORIES.has(row.category)) {
    return res.status(403).json({ error: 'This feedback response is routed to another team.' });
  }

  const status = String(req.body?.status || '');
  const internalNote = String(req.body?.internalNote ?? row.internal_note ?? '').trim();
  if (!['New', 'Reviewed', 'Follow-up'].includes(status)) {
    return res.status(400).json({ error: 'Choose New, Reviewed, or Follow-up status.' });
  }
  if (internalNote.length > 2000) {
    return res.status(400).json({ error: 'Internal note must be 2,000 characters or fewer.' });
  }
  db.prepare('UPDATE feedback SET status = ?, internal_note = ? WHERE id = ?').run(status, internalNote, id);
  const updated = db.prepare(`
    SELECT f.*, u.name AS account_name, u.education_level, u.batch AS user_batch,
      a.name AS alumni_name, a.batch AS alumni_batch, a.education_year
    FROM feedback f
    LEFT JOIN users u ON u.id = f.user_id
    LEFT JOIN alumni a ON a.id = f.alumni_id
    WHERE f.id = ?
  `).get(id);
  writeAudit(req.user, 'update', 'feedback', id, `Status: ${status}`);
  res.json({ feedback: feedbackRowForClient(updated, true) });
});

/* --------------------------- Job opportunities ---------------------------- */

router.get('/jobs', (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, COALESCE(u.name, j.created_by_name, 'Legacy posting') AS posted_by,
      COALESCE(u.role, j.created_by_role, '') AS posted_by_role
    FROM job_opportunities j
    LEFT JOIN users u ON u.id = j.created_by
    ORDER BY j.id DESC
  `).all();
  const visible = (isAdmin(req.user) || isStaff(req.user))
    ? rows
    : rows.filter((job) => job.status === 'Published' && !jobIsExpired(job));
  res.json({ jobs: visible });
});

router.post('/jobs', requireRole('admin', 'staff'), async (req, res) => {
  const validated = validateJobInput(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });
  const info = db.prepare(
    `INSERT INTO job_opportunities
      (title, company, location, description, status, industry, employment_type, qualifications,
       application_method, application_details, deadline, created_by, created_by_name, created_by_role,
       notify_in_app, notify_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ...validated.values,
    Number(req.user.id),
    String(req.user.name || req.user.username || 'Staff'),
    isAdmin(req.user) ? 'admin' : 'staff',
    validated.notifyInApp ? 1 : 0,
    validated.notifyEmail ? 1 : 0
  );
  const created = db.prepare(`
    SELECT j.*, ? AS posted_by, ? AS posted_by_role FROM job_opportunities j WHERE j.id = ?
  `).get(String(req.user.name || req.user.username || 'Staff'), isAdmin(req.user) ? 'admin' : 'staff', info.lastInsertRowid);
  writeAudit(req.user, 'create', 'job_opportunity', created.id, `${created.status}: ${created.title}`);
  let notificationResult = null;
  let notificationError = '';
  if (created.status === 'Published' && (validated.notifyInApp || validated.notifyEmail)) {
    try {
      notificationResult = await dispatchAlumniAudience(
        `New job opportunity: ${created.title}`,
        `${created.title} at ${created.company} is now open. View the Job Opportunities page for application details.`,
        'job',
        created.id,
        { inApp: validated.notifyInApp, sendEmail: validated.notifyEmail, forceChannels: true, sendSms: false }
      );
    } catch (error) {
      console.error('Unable to notify alumni about a job opportunity:', error);
      notificationError = error.message || 'Unable to dispatch alumni notifications.';
    }
  }
  mirror('job_opportunities', created);
  res.status(201).json({ job: created, notificationRequested: Boolean(created.status === 'Published' && (validated.notifyInApp || validated.notifyEmail)), notificationResult, notificationError });
});

router.get('/jobs/:id', (req, res) => {
  const job = db.prepare(`
    SELECT j.*, COALESCE(u.name, j.created_by_name, 'Legacy posting') AS posted_by,
      COALESCE(u.role, j.created_by_role, '') AS posted_by_role
    FROM job_opportunities j LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?
  `).get(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job opportunity not found.' });
  if ((job.status !== 'Published' || jobIsExpired(job)) && !isAdmin(req.user) && !isStaff(req.user)) {
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
  if (!job || job.status !== 'Published' || jobIsExpired(job)) {
    return res.status(404).json({ error: 'This job opportunity is no longer available.' });
  }
  if (job.application_method && job.application_method !== 'Portal') {
    return res.status(400).json({ error: 'Apply directly using the employer application details on the job listing.' });
  }
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

router.put('/jobs/:id', requireRole('admin', 'staff'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Job opportunity not found.' });
  const validated = validateJobInput(req.body || {}, existing);
  if (validated.error) return res.status(400).json({ error: validated.error });
  db.prepare(
    `UPDATE job_opportunities SET title = ?, company = ?, location = ?, description = ?, status = ?,
       industry = ?, employment_type = ?, qualifications = ?, application_method = ?,
       application_details = ?, deadline = ?, notify_in_app = ?, notify_email = ?
     WHERE id = ?`
  ).run(...validated.values, validated.notifyInApp ? 1 : 0, validated.notifyEmail ? 1 : 0, id);
  const job = db.prepare(`
    SELECT j.*, COALESCE(u.name, j.created_by_name, 'Legacy posting') AS posted_by,
      COALESCE(u.role, j.created_by_role, '') AS posted_by_role
    FROM job_opportunities j LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?
  `).get(id);
  writeAudit(req.user, 'update', 'job_opportunity', id, `${job.status}: ${job.title}`);
  let notificationResult = null;
  let notificationError = '';
  if (job.status === 'Published' && existing.status !== 'Published' && (validated.notifyInApp || validated.notifyEmail)) {
    try {
      notificationResult = await dispatchAlumniAudience(
        `New job opportunity: ${job.title}`,
        `${job.title} at ${job.company} is now open. View the Job Opportunities page for application details.`,
        'job',
        job.id,
        { inApp: validated.notifyInApp, sendEmail: validated.notifyEmail, forceChannels: true, sendSms: false }
      );
    } catch (error) {
      console.error('Unable to notify alumni about a job opportunity:', error);
      notificationError = error.message || 'Unable to dispatch alumni notifications.';
    }
  }
  mirrorUpdate('job_opportunities', job);
  res.json({ job, notificationRequested: Boolean(job.status === 'Published' && existing.status !== 'Published' && (validated.notifyInApp || validated.notifyEmail)), notificationResult, notificationError });
});

router.delete('/jobs/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const job = db.prepare('SELECT * FROM job_opportunities WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Job opportunity not found.' });
  const applications = db.prepare('SELECT id FROM job_applications WHERE job_id = ?').all(id);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM job_applications WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM job_opportunities WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  for (const application of applications) mirrorDelete('job_applications', application.id);
  writeAudit(req.user, 'delete', 'job_opportunity', id, job.title);
  mirrorDelete('job_opportunities', id);
  res.status(204).end();
});

/* ----------------------------- Announcements ------------------------------ */

function announcementDateError(value, field) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return `${field} must be a valid date.`;
  return '';
}

async function notifyAnnouncement(announcement) {
  const shortMessage = `${announcement.title} has been published by St. Agnes Academy. View Announcements in the Alumni Portal.`;
  if (announcement.audience === 'staff') {
    const count = await dispatchStaffAudience(
      `New announcement: ${announcement.title}`,
      shortMessage,
      'announcement',
      announcement.id
    );
    return { attempted: count };
  }
  const results = await dispatchAlumniAudience(
    `New announcement: ${announcement.title}`,
    shortMessage,
    'announcement',
    announcement.id,
    {
      inApp: Boolean(announcement.send_in_app),
      sendEmail: Boolean(announcement.send_email),
      sendSms: Boolean(announcement.send_sms),
      forceChannels: true,
      batch: announcement.audience === 'batch' ? announcement.batch : '',
      emailSubject: announcement.title,
      emailMessage: `${announcement.body || ''}\n\nView Announcements in the Alumni Portal.`,
      smsMessage: `St. Agnes Alumni: ${announcement.title} is now available. Log in to the Alumni Portal for details.`
    }
  );
  return { attempted: results.length };
}

async function activateDueAnnouncements() {
  const due = db.prepare(`
    SELECT * FROM announcements
    WHERE status = 'Scheduled' AND publish_at != '' AND publish_at <= ?
    ORDER BY id
  `).all(new Date().toISOString());
  for (const row of due) {
    const updated = db.prepare(
      "UPDATE announcements SET status = 'Published' WHERE id = ? AND status = 'Scheduled'"
    ).run(row.id);
    if (!updated.changes) continue;
    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(row.id);
    try {
      await notifyAnnouncement(announcement);
    } catch (error) {
      console.error(`Unable to notify Alumni about scheduled announcement ${row.id}:`, error);
    }
  }
}

const announcementScheduler = setInterval(() => {
  activateDueAnnouncements().catch((error) => {
    console.error('Unable to activate scheduled announcements:', error);
  });
}, 30000);
announcementScheduler.unref?.();

router.get('/announcements', async (req, res) => {
  await activateDueAnnouncements();
  const rows = db.prepare(`
    SELECT * FROM announcements
    WHERE (expires_at = '' OR expires_at IS NULL OR expires_at >= date('now'))
    ORDER BY id DESC
  `).all();
  const visible = (isAdmin(req.user) || isStaff(req.user))
    ? rows
    : rows.filter((announcement) => announcement.status === 'Published');
  res.json({ announcements: visible });
});

router.post('/announcements', requireRole('admin', 'staff'), async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const status = String(req.body?.status || 'Draft');
  const audience = String(req.body?.audience || 'all');
  const batch = String(req.body?.batch || '').trim();
  const publishDateError = announcementDateError(req.body?.publishAt, 'Publish date');
  const expirationDateError = announcementDateError(req.body?.expiresAt, 'Expiration date');
  if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
  if (!body) return res.status(400).json({ error: 'Announcement message is required.' });
  if (title.length > 160 || body.length > 10000) return res.status(400).json({ error: 'Announcement title or message exceeds the allowed length.' });
  if (publishDateError) return res.status(400).json({ error: publishDateError });
  if (expirationDateError) return res.status(400).json({ error: expirationDateError });
  if (!['Draft', 'Scheduled', 'Published'].includes(status)) return res.status(400).json({ error: 'Choose Draft, Scheduled, or Published.' });
  if (!['all', 'alumni', 'staff', 'batch'].includes(audience)) return res.status(400).json({ error: 'Choose a valid target audience.' });
  if (audience === 'batch' && !batch) return res.status(400).json({ error: 'Choose a batch year to target.' });
  const publishDate = req.body?.publishAt ? new Date(req.body.publishAt).toISOString() : '';
  const expirationDate = req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString().slice(0, 10) : '';
  if (status === 'Scheduled' && (!publishDate || new Date(publishDate) <= new Date())) {
    return res.status(400).json({ error: 'Choose a future publish date and time.' });
  }
  if (expirationDate && publishDate && expirationDate < publishDate.slice(0, 10)) {
    return res.status(400).json({ error: 'Expiration date must be after the publish date.' });
  }
  if (expirationDate && status === 'Published' && expirationDate < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Expiration date cannot be in the past.' });
  }
  const sendInApp = req.body?.sendInApp !== false;
  const sendEmail = req.body?.sendEmail === true;
  const sendSms = req.body?.sendSms === true;
  if (!sendInApp && !sendEmail && !sendSms && status !== 'Draft') {
    return res.status(400).json({ error: 'Select at least one notification channel before publishing.' });
  }
  const info = db.prepare(`
    INSERT INTO announcements
      (title, body, status, audience, batch, publish_at, expires_at, send_in_app, send_email, send_sms, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, body, status, audience, audience === 'batch' ? batch : '', publishDate, expirationDate,
    sendInApp ? 1 : 0, sendEmail ? 1 : 0, sendSms ? 1 : 0, req.user.id
  );
  let announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
  let notification = null;
  if (status === 'Published') {
    notification = await notifyAnnouncement(announcement);
  }
  writeAudit(req.user, status === 'Published' ? 'publish' : 'create', 'announcement', announcement.id, `${status}: ${title}`);
  res.status(201).json({ announcement, notification });
});

router.get('/announcements/:id', (req, res) => {
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(req.params.id));
  if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
  if (announcement.expires_at && announcement.expires_at < new Date().toISOString().slice(0, 10)) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }
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
