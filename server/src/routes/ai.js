import { Router } from 'express';
import { db, getSetting } from '../db.js';
import { ask, chat, aiProvider, isAiConfigured, aiModel } from '../ai.js';
import {
  buildAssistantSystemPrompt,
  buildUserContext,
  conversationTitle,
  detectIntent,
  detectLanguage,
  detectTopic,
  generateConversationalReply,
  isFollowUp
} from '../assistant.js';

const router = Router();

/* ------------------------------------------------------------------ *
 * Shared database context used by the fallback engines
 * ------------------------------------------------------------------ */
function stats() {
  const count = (sql) => db.prepare(sql).get()?.n || 0;
  const trackingSettings = getSetting('system_settings', {});
  const reminderMonths = Number(trackingSettings.tracking?.reminderMonths) || 6;
  const stale = db.prepare('SELECT * FROM alumni').all().filter((a) => {
    if (!a.last_updated) return true;
    const d = new Date(a.last_updated);
    if (isNaN(d.getTime())) return true;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - reminderMonths);
    return d < cutoff;
  }).length;

  return {
    reminderMonths,
    alumni: count('SELECT COUNT(*) AS n FROM alumni'),
    employed: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Employed'"),
    unemployed: count("SELECT COUNT(*) AS n FROM alumni WHERE status IN ('Unemployed','Seeking Employment')"),
    freelance: count("SELECT COUNT(*) AS n FROM alumni WHERE status IN ('Freelance','Self-employed')"),
    furtherStudies: count("SELECT COUNT(*) AS n FROM alumni WHERE status IN ('Further Studies','Post-grad','Postgraduate','Technical/Vocational Training')"),
    notSeeking: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Not Currently Seeking'"),
    noTrackingData: count("SELECT COUNT(*) AS n FROM alumni WHERE status IS NULL OR status = '' OR status = 'No Data'"),
    pendingRequests: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Pending'"),
    releasedRequests: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Released'"),
    rejectedRequests: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Rejected'"),
    totalRequests: count('SELECT COUNT(*) AS n FROM transcript_requests'),
    reprints: count('SELECT COUNT(*) AS n FROM reprints'),
    placements: count('SELECT COUNT(*) AS n FROM placements'),
    events: count('SELECT COUNT(*) AS n FROM events'),
    reunions: count('SELECT COUNT(*) AS n FROM reunions'),
    donations: count('SELECT COUNT(*) AS n FROM donations'),
    newsletters: count('SELECT COUNT(*) AS n FROM newsletters'),
    feedback: count('SELECT COUNT(*) AS n FROM feedback'),
    staleProfiles: stale
  };
}

/* ------------------------------------------------------------------ *
 * GET /api/ai/status - which engine is currently active?
 * ------------------------------------------------------------------ */
router.get('/status', (req, res) => {
  res.json({
    configured: isAiConfigured(),
    model: isAiConfigured() ? aiModel() : null,
    engine: isAiConfigured() ? 'OpenAI API' : 'Built-in fallback',
    features: ['assistant', 'compose-announcement', 'gmail-auto-reply', 'summarize-survey', 'dashboard-insights']
  });
});

function getOwnedConversation(userId, conversationId) {
  if (!conversationId) return null;
  return db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(Number(conversationId), userId);
}

function recentMessages(conversationId, limit = 12) {
  return db.prepare(
    'SELECT role, content, intent, topic, language, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?'
  ).all(Number(conversationId), limit).reverse();
}

function saveMessage(conversationId, userId, role, content, intent, topic, language) {
  db.prepare(
    `INSERT INTO ai_messages (conversation_id, user_id, role, content, intent, topic, language)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(conversationId, userId || 0, role, content, intent || '', topic || '', language || 'en');
}

function ensureConversation(user, conversationId, firstMessage) {
  const existing = getOwnedConversation(user.id, conversationId);
  if (existing) return existing;
  const info = db.prepare(
    `INSERT INTO ai_conversations (user_id, title, topic, language) VALUES (?, ?, '', 'en')`
  ).run(user.id, conversationTitle(firstMessage));
  return db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(info.lastInsertRowid);
}

router.get('/conversations', (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, topic, language, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 20'
  ).all(req.user.id);
  res.json({ conversations: rows });
});

router.post('/conversations', (req, res) => {
  const info = db.prepare(
    `INSERT INTO ai_conversations (user_id, title, topic, language) VALUES (?, 'New conversation', '', 'en')`
  ).run(req.user.id);
  res.status(201).json({ conversation: db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(info.lastInsertRowid) });
});

router.get('/conversations/:id', (req, res) => {
  const row = getOwnedConversation(req.user.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ conversation: row, messages: recentMessages(row.id, 50) });
});

router.delete('/conversations/:id', (req, res) => {
  const row = getOwnedConversation(req.user.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Conversation not found.' });
  db.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').run(row.id);
  db.prepare("UPDATE ai_conversations SET topic = '', title = 'New conversation', updated_at = datetime('now') WHERE id = ?").run(row.id);
  res.json({ ok: true, conversationId: row.id });
});

/* ------------------------------------------------------------------ *
 * POST /api/ai/assistant - contextual AI Chat Support
 * ------------------------------------------------------------------ */
router.post('/assistant', async (req, res) => {
  const query = String((req.body || {}).query || '').trim();
  if (!query) return res.status(400).json({ error: 'Query is required.' });

  const conversation = ensureConversation(req.user, req.body.conversationId, query);
  const history = recentMessages(conversation.id, 12);
  const previousTopic = conversation.topic || [...history].reverse().find((m) => m.topic)?.topic || '';
  const previousLang = conversation.language || 'en';
  const language = detectLanguage(query, previousLang);
  const topic = detectTopic(query, isFollowUp(query) ? previousTopic : previousTopic);
  const resolvedTopic = topic || previousTopic;
  const intent = detectIntent(query, resolvedTopic);
  const context = buildUserContext(req.user);

  saveMessage(conversation.id, req.user.id, 'user', query, intent, resolvedTopic, language);
  db.prepare(
    "UPDATE ai_conversations SET topic = ?, language = ?, title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(resolvedTopic, language, conversation.title === 'New conversation' ? conversationTitle(query) : conversation.title, conversation.id);

  const fallback = generateConversationalReply({
    user: req.user,
    text: query,
    language,
    topic: resolvedTopic,
    intent,
    context
  });

  let reply = fallback;
  let usedModel = false;
  if (isAiConfigured()) {
    const system = buildAssistantSystemPrompt(req.user, context, language);
    const messages = [
      { role: 'system', content: system },
      ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      { role: 'user', content: query }
    ];
    const modelReply = await chat(messages, { maxTokens: 420, temperature: 0.4 });
    if (modelReply) {
      reply = modelReply;
      usedModel = true;
    }
  }

  saveMessage(conversation.id, req.user.id, 'assistant', reply, intent, resolvedTopic, language);
  res.json({
    response: reply.replace(/\n/g, '<br>'),
    text: reply,
    conversationId: conversation.id,
    topic: resolvedTopic,
    intent,
    language,
    provider: aiProvider(usedModel ? 'chat' : 'chat fallback')
  });
});

/* ------------------------------------------------------------------ *
 * POST /api/ai/compose-announcement - AI-generated SMS / newsletter copy
 * ------------------------------------------------------------------ */
router.post('/compose-announcement', async (req, res) => {
  const { topic, channel } = req.body || {};
  const subject = topic || 'Upcoming School Activities & Alumni Engagement';
  const target = channel || 'SMS';

  const content = await ask(
    `Draft a ${target} announcement about: ${subject}. Keep it concise and professional.`,
    'You are the institutional communications officer. Draft clear, polite and inspiring announcements for SMS or Newsletter.',
    { maxTokens: 200, temperature: 0.7 }
  );

  if (content) {
    return res.json({ subject: `[SAA Update] ${subject}`, content, provider: aiProvider('compose') });
  }

  res.json({
    subject: `[SAA Update] ${subject}`,
    content: `ST. AGNES ACADEMY OF CALOOCAN INC. NOTICE: Warm greetings! In line with our upcoming school activities and alumni engagement initiatives regarding "${subject}", we invite all Agnesian graduates to participate. Please check your Alumni Portal for full schedules. Caritas et Scientia.`,
    provider: aiProvider('compose fallback')
  });
});

/* ------------------------------------------------------------------ *
 * POST /api/ai/gmail-auto-reply - Gmail Auto-Reply using OpenAI API
 *
 * Simulates the inbound-email flow described in the manuscript:
 *   alumni sends an email -> system retrieves it -> OpenAI analyses the
 *   content -> OpenAI generates a reply -> system sends the reply.
 *
 * The generated reply is logged to the notifications table (EMAIL channel)
 * so the exchange is auditable in the system.
 * ------------------------------------------------------------------ */
router.post('/gmail-auto-reply', async (req, res) => {
  const { from, subject, body } = req.body || {};
  if (!from || !body) {
    return res.status(400).json({ error: 'Both "from" and "body" (the inbound email) are required.' });
  }

  const s = stats();
  const context = [
    `Live figures you may reference when relevant: ${s.alumni} alumni records,`,
    `${s.pendingRequests} pending transcript requests, ${s.releasedRequests} released,`,
    `${s.events} upcoming events, ${s.reunions} batch reunions.`
  ].join(' ');

  const reply = await ask(
    [
      `An alumnus sent this email to the official alumni address.`,
      `From: ${from}`,
      `Subject: ${subject || '(no subject)'}`,
      `Body: ${body}`,
      '',
      'Write the email reply body only (no subject line). Be courteous and helpful.',
      'If the inquiry concerns an official document, explain the request process and',
      'that the Registrar processes and releases the document.',
      context
    ].join('\n'),
    'You are the Alumni Relations Office of St. Agnes Academy of Caloocan Inc. writing an automated email reply.',
    { maxTokens: 320, temperature: 0.6 }
  );

  const finalReply = reply || [
    `Dear Alumnus,`,
    ``,
    `Thank you for contacting the St. Agnes Academy Alumni Relations Office.`,
    `We have received your message regarding "${subject || 'your inquiry'}" and we are glad to assist you.`,
    ``,
    `For transcript and certificate requests, please file your request through the`,
    `Transcript Request Portal in the Alumni Management System. The Registrar's Office`,
    `reviews the request and notifies you by email and SMS once your document is ready for pick-up.`,
    ``,
    `For graduate tracking, events, reunions or job opportunities, you may sign in to the`,
    `Alumni Portal at your convenience.`,
    ``,
    `Should you need further assistance, simply reply to this email.`,
    ``,
    `Respectfully,`,
    `Alumni Relations Office`,
    `St. Agnes Academy of Caloocan Inc.`,
    `Caritas et Scientia`
  ].join('\n');

  // Log the auto-reply so the communication trail is auditable.
  db.prepare(
    'INSERT INTO notifications (channel, recipient, subject, message) VALUES (?, ?, ?, ?)'
  ).run('EMAIL', from, `Re: ${subject || 'Alumni Inquiry'}`, finalReply);

  res.json({
    from,
    subject: `Re: ${subject || 'Alumni Inquiry'}`,
    reply: finalReply,
    provider: aiProvider(reply ? 'gmail auto-reply' : 'gmail auto-reply fallback'),
    logged: true
  });
});

/* ------------------------------------------------------------------ *
 * POST /api/ai/summarize-survey - OpenAI summary of survey responses
 * ------------------------------------------------------------------ */
router.post('/summarize-survey', async (req, res) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC').all();
  if (!rows.length) {
    return res.json({
      summary: 'No survey responses have been collected yet, so there is nothing to summarize.',
      provider: aiProvider('survey summary'),
      responses: 0
    });
  }

  const transcript = rows
    .map((r, i) => `${i + 1}. [${r.category || 'General'} | ${r.rating}/5] ${r.message}`)
    .join('\n');

  const summary = await ask(
    [
      'Summarize the following alumni survey responses for the school administration.',
      'Return: (1) an overall sentiment statement, (2) the main themes raised,',
      '(3) concrete recommendations. Use short labeled sections and be specific.',
      '',
      `Survey responses (${rows.length} total):`,
      transcript
    ].join('\n'),
    'You are an institutional research analyst producing survey summaries.',
    { maxTokens: 500, temperature: 0.4 }
  );

  /* Built-in fallback: computed statistics summary. */
  const avg = rows.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / rows.length;
  const byCategory = rows.reduce((acc, r) => {
    const key = r.category || 'General';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const themes = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `  - ${cat}: ${n} response(s)`)
    .join('\n');

  const fallbackSummary = [
    'SURVEY SUMMARY (computed)',
    `Responses collected: ${rows.length}`,
    `Average rating: ${avg.toFixed(2)} / 5`,
    '',
    'Responses by category:',
    themes,
    '',
    'Latest comments:',
    ...rows.slice(0, 3).map((r) => `  - ${r.name || 'Anonymous'}: ${r.message}`),
    '',
    'Note: set OPENAI_API_KEY on the server to generate a narrative analysis.'
  ].join('\n');

  res.json({
    summary: summary || fallbackSummary,
    provider: aiProvider(summary ? 'survey summary' : 'survey summary fallback'),
    responses: rows.length,
    averageRating: Number(avg.toFixed(2))
  });
});

/* ------------------------------------------------------------------ *
 * POST /api/ai/dashboard-insights - AI dashboard insights for administrators
 * ------------------------------------------------------------------ */
router.post('/dashboard-insights', async (req, res) => {
  const s = stats();
  const knownStatusCount = s.alumni - s.noTrackingData;
  const employmentRate = knownStatusCount ? Math.round(((s.employed + s.freelance) / knownStatusCount) * 100) : 0;
  const freshness = s.alumni ? Math.round(((s.alumni - s.staleProfiles) / s.alumni) * 100) : 0;

  const insights = await ask(
    [
      'Review these Alumni Management System figures and provide insights for the administration.',
      'Return: (1) what the numbers show, (2) concerns to address, (3) recommended actions.',
      'Use short labeled sections.',
      '',
      `Alumni records: ${s.alumni}`,
      `Graduate outcomes - employed: ${s.employed}, self-employed: ${s.freelance}, seeking employment: ${s.unemployed}, further studies or training: ${s.furtherStudies}, not currently seeking: ${s.notSeeking}, no status data: ${s.noTrackingData}`,
      `Employment rate among alumni with reported status: ${employmentRate}%`,
      `Profile freshness: ${freshness}% (${s.staleProfiles} profiles outside the configured ${s.reminderMonths}-month reminder period)`,
      `Transcript requests - total: ${s.totalRequests}, pending: ${s.pendingRequests}, released: ${s.releasedRequests}, rejected: ${s.rejectedRequests}`,
      `Certificate reprints: ${s.reprints}`,
      `Job placements logged: ${s.placements}`,
      `Events: ${s.events}, batch reunions: ${s.reunions}`,
      `Donations recorded: ${s.donations}, newsletters: ${s.newsletters}`,
      `Survey responses: ${s.feedback}`
    ].join('\n'),
    'You are an institutional data analyst advising the school administration.',
    { maxTokens: 550, temperature: 0.4 }
  );

  /* Built-in fallback: rule-based insights from the same figures. */
  const observations = [];
  observations.push(`Employment rate among alumni with reported status is ${employmentRate}% (${s.employed} employed, ${s.freelance} self-employed).`);
  if (s.unemployed > 0) observations.push(`${s.unemployed} graduate(s) reported seeking employment and may need job-placement or career support.`);
  if (s.noTrackingData > 0) observations.push(`${s.noTrackingData} alumni have no graduate status data; they are not counted as unemployed.`);
  if (s.staleProfiles > 0) {
    observations.push(`Profile freshness is ${freshness}% - ${s.staleProfiles} profile(s) are outside the configured ${s.reminderMonths}-month reminder period; review candidates in Graduate Tracking.`);
  } else {
    observations.push(`All alumni profiles are within the configured ${s.reminderMonths}-month reminder period.`);
  }
  if (s.pendingRequests > 0) observations.push(`${s.pendingRequests} transcript request(s) are pending action by the Registrar.`);
  if (s.releasedRequests > 0) observations.push(`${s.releasedRequests} document(s) have been released to alumni.`);
  if (s.reprints > 0) observations.push(`${s.reprints} certificate reprint request(s) are on file.`);
  if (s.placements > 0) observations.push(`${s.placements} job placement(s) have been recorded.`);
  if (s.reunions > 0) observations.push(`${s.reunions} batch reunion(s) are organized.`);
  if (s.feedback > 0) observations.push(`${s.feedback} survey response(s) have been collected for review.`);

  const fallbackInsights = [
    'DASHBOARD INSIGHTS (computed)',
    '',
    'Observations:',
    ...observations.map((o) => `  - ${o}`),
    '',
    'Note: set OPENAI_API_KEY on the server to generate an AI narrative analysis.'
  ].join('\n');

  res.json({
    insights: insights || fallbackInsights,
    provider: aiProvider(insights ? 'dashboard insights' : 'dashboard insights fallback'),
    metrics: {
      alumni: s.alumni,
      employmentRate,
      freshness,
      staleProfiles: s.staleProfiles,
      pendingRequests: s.pendingRequests
    }
  });
});

export default router;