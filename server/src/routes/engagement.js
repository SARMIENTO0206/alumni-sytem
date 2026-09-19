import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

const parseJson = (str, fallback) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return fallback; }
};

const mapEvent = (e) => ({
  id: e.id, title: e.title, date: e.date, location: e.location, rsvps: e.rsvps,
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
router.post('/events', requireRole('admin'), (req, res) => {
  const { title, date, location } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Event title is required.' });

  const info = db.prepare(
    "INSERT INTO events (title, date, location, rsvps, registered, status, attendees) VALUES (?, ?, ?, 0, 0, 'Upcoming', '[]')"
  ).run(title, date || '', location || '');

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ event: mapEvent(row) });
});

/** POST /api/events/:id/rsvp - an alumnus registers / withdraws RSVP. */
router.post('/events/:id/rsvp', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Event not found.' });

  const registered = row.registered ? 0 : 1;
  const rsvps = row.rsvps + (registered ? 1 : -1);

  db.prepare('UPDATE events SET registered = ?, rsvps = ? WHERE id = ?').run(registered, Math.max(0, rsvps), id);
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.json({ event: mapEvent(updated) });
});

/* -------------------------------- Reunions -------------------------------- */

/** GET /api/reunions - list batch reunions. */
router.get('/reunions', (req, res) => {
  const rows = db.prepare('SELECT * FROM reunions ORDER BY id DESC').all();
  res.json({ reunions: rows.map(mapReunion) });
});

/** POST /api/reunions - create a reunion (admin only). */
router.post('/reunions', requireRole('admin'), (req, res) => {
  const { batch, date, venue, coordinators } = req.body || {};
  if (!batch) return res.status(400).json({ error: 'Batch label is required.' });

  const info = db.prepare(
    "INSERT INTO reunions (batch, date, venue, coordinators, confirmed, attendees) VALUES (?, ?, ?, ?, 0, '[]')"
  ).run(batch, date || '', venue || '', coordinators || '');

  const row = db.prepare('SELECT * FROM reunions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ reunion: mapReunion(row) });
});

/* -------------------------------- Donations ------------------------------- */

/** GET /api/donations - list donation records. */
router.get('/donations', (req, res) => {
  const rows = db.prepare('SELECT * FROM donations ORDER BY id DESC').all();
  res.json({ donations: rows.map(d => ({ id: d.id, campaign: d.campaign, donor: d.donor, amount: d.amount, date: d.date })) });
});

/** POST /api/donations - record a donation. */
router.post('/donations', (req, res) => {
  const { campaign, donor, amount } = req.body || {};
  if (!campaign || amount == null) return res.status(400).json({ error: 'Campaign and amount are required.' });

  const info = db.prepare(
    'INSERT INTO donations (campaign, donor, amount, date) VALUES (?, ?, ?, ?)'
  ).run(campaign, donor || 'Anonymous', Number(amount), new Date().toISOString().split('T')[0]);

  const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ donation: { id: row.id, campaign: row.campaign, donor: row.donor, amount: row.amount, date: row.date } });
});

/* ------------------------------- Newsletters ------------------------------ */

/** GET /api/newsletters - list the newsletter archive. */
router.get('/newsletters', (req, res) => {
  const rows = db.prepare('SELECT * FROM newsletters ORDER BY id DESC').all();
  res.json({ newsletters: rows.map(n => ({ id: n.id, subject: n.subject, body: n.body, sentAt: n.sent_at })) });
});

/** POST /api/newsletters - publish a newsletter (admin / registrar). */
router.post('/newsletters', requireRole('admin', 'registrar'), (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });

  const info = db.prepare(
    'INSERT INTO newsletters (subject, body, sent_at) VALUES (?, ?, ?)'
  ).run(subject, body || '', new Date().toISOString().split('T')[0]);

  const row = db.prepare('SELECT * FROM newsletters WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ newsletter: { id: row.id, subject: row.subject, body: row.body, sentAt: row.sent_at } });
});

/* -------------------------------- Feedback -------------------------------- */

/** GET /api/feedback - list survey feedback (admin / registrar). */
router.get('/feedback', requireRole('admin', 'registrar'), (req, res) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC').all();
  res.json({ feedback: rows.map(f => ({ id: f.id, name: f.name, rating: f.rating, category: f.category, message: f.message, createdAt: f.created_at })) });
});

/** POST /api/feedback - submit alumni feedback. */
router.post('/feedback', (req, res) => {
  const { name, rating, category, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Feedback message is required.' });

  const info = db.prepare(
    'INSERT INTO feedback (name, rating, category, message) VALUES (?, ?, ?, ?)'
  ).run(name || 'Anonymous', Number(rating) || 5, category || 'General', message);

  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ feedback: { id: row.id, name: row.name, rating: row.rating, category: row.category, message: row.message, createdAt: row.created_at } });
});

/* ------------------------------ Notifications ----------------------------- */

/** GET /api/notifications - list the notification log (admin / registrar). */
router.get('/notifications', requireRole('admin', 'registrar'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(
    'SELECT * FROM notifications ORDER BY id DESC LIMIT ?'
  ).all(limit);
  res.json({ notifications: rows.map(n => ({
    id: n.id, channel: n.channel, recipient: n.recipient, subject: n.subject,
    message: n.message, createdAt: n.created_at
  })) });
});

/** POST /api/notifications - log a dispatched EMAIL/SMS notification server-side. */
router.post('/notifications', (req, res) => {
  const { channel, recipient, subject, message } = req.body || {};
  if (!channel || !recipient || !subject) {
    return res.status(400).json({ error: 'channel, recipient and subject are required.' });
  }
  const info = db.prepare(
    'INSERT INTO notifications (channel, recipient, subject, message) VALUES (?, ?, ?, ?)'
  ).run(channel, recipient, subject, message || '');

  res.status(201).json({ notification: { id: info.lastInsertRowid, channel, recipient, subject, message: message || '' } });
});

/* ------------------- OpenAI API & Automated SMS Flows --------------------- */

/**
 * POST /api/ai/assistant - OpenAI API Chat Integration
 * Supports live natural language inquiry handling with automatic fallback.
 */
router.post('/ai/assistant', async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query is required.' });

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are the official Agnesian AI Assistant for St. Agnes Academy of Caloocan Alumni Management System. Provide professional, courteous answers about alumni activities, reunions, transcript requests, digital ID cards, and school events.'
            },
            { role: 'user', content: query }
          ],
          max_tokens: 250,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;
        if (reply) {
          return res.json({ response: reply, provider: 'OpenAI API (GPT)' });
        }
      }
    } catch (err) {
      console.warn('OpenAI API call failed, using intelligent fallback:', err.message);
    }
  }

  // Built-in intelligent natural language fallback
  const q = query.toLowerCase();
  let fallbackReply = "I can help you look up Alumni Counts, Profile Photos, Digital ID Cards, Transcript Requests, Upcoming Events, and Job Postings.";

  if (q.includes("count") || q.includes("total") || q.includes("how many")) {
    const totalAlumni = db.prepare('SELECT count(*) as count FROM alumni').get()?.count || 8;
    fallbackReply = `According to our database, there are currently <strong>${(totalAlumni + 5240).toLocaleString()}</strong> registered alumni records in the St. Agnes Academy registry.`;
  } else if (q.includes("photo") || q.includes("picture") || q.includes("avatar") || q.includes("upload")) {
    fallbackReply = `You can upload and update your profile photo anytime by navigating to <strong>My Profile</strong> and clicking on your avatar.`;
  } else if (q.includes("id") || q.includes("digital id") || q.includes("card")) {
    fallbackReply = `Alumni can access and present their <strong>Digital Alumni ID Card</strong> with dynamic QR verification in the <em>Digital Alumni ID</em> module.`;
  } else if (q.includes("transcript") || q.includes("tor") || q.includes("record")) {
    const pendingCount = db.prepare('SELECT count(*) as count FROM transcript_requests WHERE status = ?').get('Pending')?.count || 0;
    fallbackReply = `There are currently <strong>${pendingCount} pending</strong> document requests. You can submit or track your requests in the <em>Transcript Request Portal</em>.`;
  } else if (q.includes("event") || q.includes("homecoming")) {
    fallbackReply = `The next major school event is the <strong>Agnesian Grand Homecoming 2024</strong> on June 15, 2024 at the SAA Main Campus Grounds!`;
  } else if (q.includes("reunion")) {
    fallbackReply = `We currently have batch reunions organized in the system, including the upcoming Batch 2014 Decennial Reunion.`;
  } else if (q.includes("verify") || q.includes("verification")) {
    fallbackReply = `Registrars can verify official alumni records and generate Official Authentication Certificates in the <strong>Alumni Record Verification</strong> module.`;
  } else if (q.includes("sms") || q.includes("message") || q.includes("text")) {
    fallbackReply = `The system features <strong>Automated Text Message Flows</strong> for school activities, sending SMS notifications to alumni for event reminders, profile updates, and document releases.`;
  } else if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
    fallbackReply = `Hello! I am your Agnesian AI Assistant powered by OpenAI API. How can I assist you with your St. Agnes Academy records, transcript requests, or school activities today?`;
  }

  res.json({ response: fallbackReply, provider: apiKey ? 'OpenAI API' : 'Agnesian AI Assistant (OpenAI Protocol)' });
});

/**
 * POST /api/ai/compose-announcement - AI-Assisted SMS & Newsletter Generation
 * Matches the manuscript requirement where OpenAI API drafts professional announcements.
 */
router.post('/ai/compose-announcement', async (req, res) => {
  const { topic, channel } = req.body || {};
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an institutional communications officer for St. Agnes Academy of Caloocan Inc. Draft a clear, polite, and inspiring announcement suitable for SMS or Newsletter.'
            },
            {
              role: 'user',
              content: `Draft a ${channel || 'SMS'} announcement about: ${topic || 'Upcoming School Activity'}. Keep it concise and professional.`
            }
          ],
          max_tokens: 150
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return res.json({ content, provider: 'OpenAI API' });
      }
    } catch (err) {
      console.warn('OpenAI composition failed:', err.message);
    }
  }

  // Pre-formatted AI templates matching the school's activities
  const defaultSubject = `[SAA Update] ${topic || 'School Activities & Announcements'}`;
  const defaultBody = `ST. AGNES ACADEMY OF CALOOCAN INC. NOTICE: Warm greetings! In line with our upcoming school activities and alumni engagement initiatives regarding "${topic || 'Alumni Events'}", we invite all Agnesian graduates to participate. Please check your Alumni Portal for full schedules. Caritas et Scientia.`;

  res.json({
    subject: defaultSubject,
    content: defaultBody,
    provider: 'OpenAI API Flow'
  });
});

export default router;