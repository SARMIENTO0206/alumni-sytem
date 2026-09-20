import { db } from './db.js';
import { isAdmin, isAlumni, isStaff, normalizeRole } from './auth.js';

const FOLLOW_UP = /^(where|how|what about|how long|can i change|what do i need|and then|okay|ok|sige|oo|opo|yes|no|hindi|ano|saan|paano|tapos|ano yun|ano yon|what\??|why\??|when\??|and\??|then\??|what does that mean\??|ano ibig sabihin\??|ano kailangan\??|saan ko makikita\??|san\??)$/i;
const CONFUSION = /\b(di ko gets|hindi ko maintindihan|hindi ko gets|ano ibig sabihin|ang hirap|what\?|di ko maintindihan|explain|simplify|ulit|ano yun|ano yon)\b/i;
const ACK = /^(okay|ok|ah okay|sige|thanks|thank you|salamat|got it|noted|oo|opo|yes|yeah)\.?$/i;

const FIL_MARKERS = /\b(paano|saan|san|yung|iyong|ako|ko|ang|ng|mga|hindi|di|gets|ano|kailangan|makikita|pwede|pwedeng|po|opo|sige|lang|naman|tapos|nung|para|kung|mo|ba|na|sa|request|status)\b/i;
const ENG_MARKERS = /\b(the|how|where|what|can|please|request|status|submit|check|update|profile|settings)\b/i;

export function detectLanguage(text, previous = 'en') {
  const raw = String(text || '');
  const fil = (raw.match(FIL_MARKERS) || []).length;
  const eng = (raw.match(ENG_MARKERS) || []).length;
  if (fil >= 2 && eng >= 1) return 'taglish';
  if (fil >= 2 && eng === 0) return 'fil';
  if (fil >= 1 && /[ñáéíóú]|yung|saan|paano|kailangan/.test(raw.toLowerCase())) return fil > eng ? 'fil' : 'taglish';
  if (eng >= 1 && fil === 0) return 'en';
  return previous || 'en';
}

export function isFollowUp(text) {
  const q = String(text || '').trim();
  if (q.length <= 22 && FOLLOW_UP.test(q.replace(/[.!]/g, ''))) return true;
  return /^(saan|san|paano|ano|where|how|what|and then|tapos)/i.test(q) && q.split(/\s+/).length <= 6;
}

export function isConfusion(text) {
  return CONFUSION.test(String(text || ''));
}

export function isAck(text) {
  return ACK.test(String(text || '').trim());
}

export function detectTopic(text, previous = '') {
  const q = String(text || '').toLowerCase();
  const rules = [
    ['transcript', /transcript|tor|official record|academic record request/],
    ['reprint', /reprint|certificate|diploma|certific/],
    ['documents', /document request|request status|yung request|my request/],
    ['jobs', /job|opportunity|career|apply|application|trabaho/],
    ['events', /event|homecoming|rsvp|attend/],
    ['reunions', /reunion|batch reunion/],
    ['tracking', /employment|tracking|graduate tracking|work|employer|further stud|education information/],
    ['profile', /profile|picture|photo|avatar|my account|pangalan/],
    ['settings', /settings|password|notification preference|privacy/],
    ['survey', /survey|feedback|feedback form/],
    ['announcements', /announcement|anunsyo/],
    ['notifications', /notification|alert|abiso/],
    ['newsletter', /newsletter/],
    ['donations', /donor|donation|donate|campaign/],
    ['users', /user management|roles|permissions|account list/],
    ['reports', /system reports|tracer|operational report/],
    ['idcard', /digital id|alumni id|id card/]
  ];
  for (const [topic, re] of rules) {
    if (re.test(q)) return topic;
  }
  return previous || '';
}

export function detectIntent(text, topic) {
  const q = String(text || '').toLowerCase();
  if (isConfusion(q)) return 'confusion';
  if (isAck(q)) return 'ack';
  if (/status|nasaan na|asa na|approved|processing|released|rejected/.test(q)) return 'status';
  if (/kailangan|need|requirement|ano kailangan|what do i need/.test(q)) return 'requirements';
  if (/saan|san|where|makikita|find|open/.test(q)) return 'where';
  if (/paano|how do i|how to|steps|mag request|submit/.test(q)) return 'howto';
  if (/meaning|ibig sabihin|what does/.test(q)) return 'meaning';
  if (/update|change|edit/.test(q)) return 'update';
  if (/hello|hi |hey|kumusta|good day/.test(q)) return 'greeting';
  if (topic) return 'followup';
  return 'general';
}

export function buildUserContext(user) {
  const role = normalizeRole(user?.role);
  const context = { role, name: user?.name || '', own: {}, operational: {} };

  if (isAlumni(user)) {
    const uid = Number(user.id);
    const aid = Number(user.alumniId || 0);
    context.own.transcripts = db.prepare(
      'SELECT id, status, purpose, type, remarks, date FROM transcript_requests WHERE user_id = ? OR alumni_id = ? ORDER BY id DESC LIMIT 5'
    ).all(uid, aid);
    context.own.reprints = db.prepare(
      'SELECT id, status, type, remarks FROM reprints WHERE user_id = ? OR alumni_id = ? ORDER BY id DESC LIMIT 5'
    ).all(uid, aid);
    context.own.alumni = aid
      ? db.prepare('SELECT id, name, batch, program, status, company, job_title, education_school, education_program FROM alumni WHERE id = ?').get(aid)
      : null;
    context.own.jobs = db.prepare("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'").get().n;
    context.own.events = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    context.own.applications = db.prepare('SELECT COUNT(*) AS n FROM job_applications WHERE user_id = ?').get(uid).n;
  }

  if (isAdmin(user) || isStaff(user)) {
    context.operational.pendingTranscripts = db.prepare("SELECT COUNT(*) AS n FROM transcript_requests WHERE status IN ('Pending','Processing')").get().n;
    context.operational.pendingReprints = db.prepare("SELECT COUNT(*) AS n FROM reprints WHERE status IN ('Pending','Processing')").get().n;
    context.operational.alumni = db.prepare('SELECT COUNT(*) AS n FROM alumni').get().n;
    context.operational.publishedJobs = db.prepare("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'").get().n;
    context.operational.events = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  }

  return context;
}

function statusMeaning(status, lang) {
  const key = String(status || '').toLowerCase();
  const map = {
    pending: {
      en: 'Pending means the request was submitted and is waiting for staff review.',
      fil: 'Ang Pending ibig sabihin naipasa na ang request at naghihintay ng review ng staff.'
    },
    submitted: {
      en: 'Submitted means the request is already in the system and waiting for review.',
      fil: 'Ang Submitted ibig sabihin naipasa na ang request at naghihintay ng review.'
    },
    processing: {
      en: 'Processing means staff is already working on the request. It is not ready for release yet.',
      fil: 'Ang Processing ibig sabihin ginagawa na ng staff ang request mo. Hindi pa ready for release.'
    },
    approved: {
      en: 'Approved means the request was accepted. Next it may move to processing or ready for release.',
      fil: 'Ang Approved ibig sabihin tinanggap na ang request. Pwede itong lumipat sa processing o ready for release.'
    },
    rejected: {
      en: 'Rejected means the request was not approved. Check the remarks on the request for the reason.',
      fil: 'Ang Rejected ibig sabihin hindi na-approve ang request. Tingnan ang remarks para sa dahilan.'
    },
    'ready for release': {
      en: 'Ready for Release means the document is prepared and can go through the release or claim process.',
      fil: 'Ang Ready for Release ibig sabihin handa na ang dokumento para sa release o claim.'
    },
    released: {
      en: 'Released means the document was already released or claimed.',
      fil: 'Ang Released ibig sabihin naibigay na ang dokumento.'
    }
  };
  const row = map[key];
  if (!row) return lang === 'en' ? `The status "${status}" is the current processing state of the record.` : `Ang status na "${status}" ang kasalukuyang estado ng record.`;
  return lang === 'en' ? row.en : row.fil;
}

function pathFor(topic, role) {
  const alumni = {
    transcript: 'Document Requests > Transcript Requests',
    reprint: 'Document Requests > Certificate Reprints',
    documents: 'Document Requests > Request Status',
    tracking: 'Graduate Tracking > My Employment Information',
    jobs: 'Career Management > Job Opportunities',
    events: 'Alumni Engagement > Alumni Events',
    reunions: 'Alumni Engagement > Batch Reunions',
    donations: 'Alumni Engagement > Donor Campaigns',
    newsletter: 'Alumni Engagement > Alumni Newsletter',
    survey: 'Alumni Engagement > Surveys & Feedback',
    announcements: 'Communications > Announcements',
    notifications: 'Communications > Notifications',
    profile: 'My Profile',
    settings: 'Settings',
    idcard: 'My Profile / Digital Alumni ID'
  };
  const staff = {
    ...alumni,
    transcript: 'Document Requests > Transcript Requests',
    tracking: 'Graduate Tracking',
    jobs: 'Career Management > Job Opportunities',
    reports: 'Reports',
    users: 'User & Access Management is not available to Staff',
    profile: 'Profile',
    settings: 'Settings'
  };
  const admin = {
    ...staff,
    reports: 'System Reports',
    users: 'User & Access Management',
    settings: 'Settings'
  };
  const table = role === 'admin' ? admin : role === 'alumni' ? alumni : staff;
  return table[topic] || 'the matching module in the sidebar';
}

function topicLabel(topic, lang) {
  const labels = {
    transcript: { en: 'transcript request', fil: 'transcript request' },
    reprint: { en: 'certificate reprint', fil: 'certificate reprint' },
    documents: { en: 'document request', fil: 'document request' },
    jobs: { en: 'job opportunities', fil: 'job opportunities' },
    events: { en: 'alumni events', fil: 'alumni events' },
    tracking: { en: 'graduate tracking', fil: 'graduate tracking' },
    survey: { en: 'surveys and feedback', fil: 'surveys at feedback' },
    profile: { en: 'profile', fil: 'profile' }
  };
  const row = labels[topic];
  if (!row) return topic || (lang === 'en' ? 'that item' : 'yun');
  return lang === 'en' ? row.en : row.fil;
}

function ownRequestLine(context, topic, lang) {
  const list = topic === 'reprint' ? context.own.reprints : context.own.transcripts;
  if (!list || !list.length) {
    return lang === 'en'
      ? `I do not see an active ${topicLabel(topic, lang)} on your account yet.`
      : `Wala akong nakitang active ${topicLabel(topic, lang)} sa account mo.`;
  }
  const latest = list[0];
  return lang === 'en'
    ? `I found your ${topicLabel(topic, lang)} #${latest.id}. Current status: ${latest.status}${latest.remarks ? `. Staff remarks: ${latest.remarks}` : ''}.`
    : `May nakita akong ${topicLabel(topic, lang)} mo na Request ID #${latest.id}. Current status: ${latest.status}${latest.remarks ? `. Remarks: ${latest.remarks}` : ''}.`;
}

function steps(topic, lang) {
  if (topic === 'transcript') {
    return lang === 'en'
      ? ['Open Document Requests.', 'Select Transcript Requests.', 'Click Request New Transcript.', 'Enter the required information, including the purpose.', 'Submit the request.', 'Return to Transcript Requests to see the status.']
      : ['Pumunta sa Document Requests.', 'Piliin ang Transcript Requests.', 'I-click ang Request New Transcript.', 'Ilahad ang required information, kasama ang purpose.', 'I-submit ang request.', 'Bumalik sa Transcript Requests para makita ang status.'];
  }
  if (topic === 'reprint') {
    return lang === 'en'
      ? ['Open Document Requests.', 'Select Certificate Reprints.', 'Submit a reprint request and choose the certificate type.', 'Complete the required information.', 'Submit the request.', 'Check the same page for the status.']
      : ['Pumunta sa Document Requests.', 'Piliin ang Certificate Reprints.', 'Mag-submit ng reprint request at piliin ang certificate type.', 'Kumpletuhin ang required information.', 'I-submit ang request.', 'Sa parehong page makikita ang status.'];
  }
  if (topic === 'tracking') {
    return lang === 'en'
      ? ['Open Graduate Tracking.', 'Click Update My Status.', 'Enter employment or further-education information.', 'Save the record.']
      : ['Pumunta sa Graduate Tracking.', 'I-click ang Update My Status.', 'Ilahad ang employment o further-education information.', 'I-save ang record.'];
  }
  if (topic === 'jobs') {
    return lang === 'en'
      ? ['Open Career Management > Job Opportunities.', 'Open a published job.', 'Use Apply if you want to submit an application.']
      : ['Pumunta sa Career Management > Job Opportunities.', 'Buksan ang published job.', 'I-click ang Apply kung mag-a-apply ka.'];
  }
  if (topic === 'events') {
    return lang === 'en'
      ? ['Open Alumni Engagement > Alumni Events.', 'Open the event.', 'Register or RSVP from that page.']
      : ['Pumunta sa Alumni Engagement > Alumni Events.', 'Buksan ang event.', 'Mag-register o mag-RSVP doon.'];
  }
  if (topic === 'survey') {
    return lang === 'en'
      ? ['Open Alumni Engagement > Surveys & Feedback.', 'Complete the form.', 'Submit your response.']
      : ['Pumunta sa Alumni Engagement > Surveys & Feedback.', 'Sagutan ang form.', 'I-submit ang sagot.'];
  }
  if (topic === 'profile') {
    return lang === 'en'
      ? ['Open My Profile.', 'Update the allowed fields.', 'Save the changes.']
      : ['Pumunta sa My Profile.', 'I-update ang allowed fields.', 'I-save ang changes.'];
  }
  return [];
}

function formatSteps(list, lang) {
  const title = lang === 'en' ? 'Here are the steps:' : 'Ganito lang:';
  return `${title}\n${list.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export function generateConversationalReply({ user, text, language, topic, intent, context }) {
  const lang = language === 'en' ? 'en' : 'fil';
  const role = normalizeRole(user?.role);
  const name = user?.name || '';

  if (intent === 'greeting') {
    return lang === 'en'
      ? `Hello${name ? `, ${name}` : ''}. I can help you with this Alumni Management System. What do you need help with?`
      : `Hello${name ? `, ${name}` : ''}. Pwede kitang tulungan sa Alumni Management System. Ano ang kailangan mo?`;
  }

  if (intent === 'ack') {
    const next = topic ? pathFor(topic, role) : (role === 'alumni' ? 'Document Requests or My Profile' : 'the module you are working on');
    return lang === 'en'
      ? `Okay. If you want to continue, you can open ${next}.`
      : `Okay. Kung gusto mong ituloy, buksan mo ang ${next}.`;
  }

  if (intent === 'confusion') {
    const mentioned = String(text).match(/pending|processing|approved|rejected|released|ready for release|submitted|under review/i);
    if (mentioned) return statusMeaning(mentioned[0], lang);
    if (topic === 'transcript' || topic === 'reprint' || topic === 'documents') {
      const simple = steps(topic === 'documents' ? 'transcript' : topic, lang);
      return lang === 'en'
        ? `I'll keep this simple.\n\n${formatSteps(simple, lang)}\n\nAfter you submit, the status on that same page tells you what staff is doing.`
        : `Okay, simple lang.\n\n${formatSteps(simple, lang)}\n\nPag na-submit mo na, sa parehong page makikita ang status.`;
    }
    return lang === 'en'
      ? 'I will say it more simply. Tell me which part is unclear: where to click, what to submit, or what a status means.'
      : 'Sige, mas simple. Sabihin mo kung alin ang hindi malinaw: saan mag-click, ano isusubmit, o ano ibig sabihin ng status.';
  }

  if (intent === 'meaning') {
    const mentioned = String(text).match(/pending|processing|approved|rejected|released|ready for release|submitted|under review/i);
    if (mentioned) return statusMeaning(mentioned[0], lang);
    if (topic === 'transcript' || topic === 'reprint') return statusMeaning('processing', lang);
  }

  if ((intent === 'status' || /nasaan na|asa na/.test(String(text).toLowerCase())) && (topic === 'transcript' || topic === 'reprint' || topic === 'documents')) {
    const kind = topic === 'reprint' ? 'reprint' : 'transcript';
    if (isAlumni(user)) {
      return `${ownRequestLine(context, kind, lang)} ${lang === 'en'
        ? `Open ${pathFor(kind, role)} to see the same record.`
        : `Buksan ang ${pathFor(kind, role)} para makita ang parehong record.`}`;
    }
    return lang === 'en'
      ? `Staff can review all ${kind} requests in ${pathFor(kind, role)}. Pending and Processing items are the ones that still need action.`
      : `Sa ${pathFor(kind, role)} makikita ng Staff ang lahat ng ${kind} requests. Ang Pending at Processing ang kailangan pang aksyunan.`;
  }

  if (intent === 'requirements' && (topic === 'transcript' || topic === 'reprint' || topic === 'documents')) {
    return lang === 'en'
      ? `For a ${topicLabel(topic === 'reprint' ? 'reprint' : 'transcript', lang)}, complete the required fields on the request form, including purpose or certificate type. Upload supporting documents only if the form asks for them. This system does not add extra payment steps that are not shown on the form.`
      : `Para sa ${topicLabel(topic === 'reprint' ? 'reprint' : 'transcript', lang)}, kumpletuhin ang required information sa request form, kasama ang purpose o certificate type. Mag-upload lang ng supporting documents kung hinihingi ng form. Walang extra payment step maliban sa kung ano ang talagang nasa form.`;
  }

  if (intent === 'where' || intent === 'followup') {
    if (topic) {
      return lang === 'en'
        ? `If you mean your ${topicLabel(topic, lang)}, open ${pathFor(topic, role)}. Your current record and status are shown there.`
        : `Kung ang tinutukoy mo ay yung ${topicLabel(topic, lang)}, pumunta sa ${pathFor(topic, role)}. Doon mo makikita ang record at current status.`;
    }
    return lang === 'en'
      ? 'If you mean a transcript request, open Document Requests > Transcript Requests. If you mean a certificate reprint, open Document Requests > Certificate Reprints.'
      : 'Kung transcript request, pumunta sa Document Requests > Transcript Requests. Kung certificate reprint, pumunta sa Document Requests > Certificate Reprints.';
  }

  if (intent === 'howto' || (!topic && /request|update|register|apply/.test(String(text).toLowerCase()))) {
    const useTopic = topic || ( /reprint|certificate/.test(String(text).toLowerCase()) ? 'reprint' : /transcript/.test(String(text).toLowerCase()) ? 'transcript' : '');
    const list = steps(useTopic, lang);
    if (list.length) return formatSteps(list, lang);
  }

  if (topic === 'jobs') {
    if (isAlumni(user)) {
      return lang === 'en'
        ? `Published jobs are in Career Management > Job Opportunities. There are currently ${context.own.jobs} published listing(s). You can open a job and apply from that page. Your applications are in Career Management > My Applications / Referrals.`
        : `Nasa Career Management > Job Opportunities ang published jobs. May ${context.own.jobs} published listing ngayon. Pwede kang mag-apply doon. Ang applications mo ay nasa Career Management > My Applications / Referrals.`;
    }
    return lang === 'en'
      ? `Staff and administrators manage job listings in Career Management > Job Opportunities. Published jobs are the ones alumni can see.`
      : `Sa Career Management > Job Opportunities naka-manage ang job listings. Ang Published jobs ang nakikita ng alumni.`;
  }

  if (topic === 'events' || topic === 'reunions') {
    return lang === 'en'
      ? `${topic === 'reunions' ? 'Batch reunions' : 'Alumni events'} are under Alumni Engagement > ${topic === 'reunions' ? 'Batch Reunions' : 'Alumni Events'}. Open an item to view details and register if registration is available.`
      : `Nasa Alumni Engagement > ${topic === 'reunions' ? 'Batch Reunions' : 'Alumni Events'} iyon. Buksan ang item para sa details at registration kung available.`;
  }

  if (topic === 'tracking') {
    if (isAlumni(user) && context.own.alumni) {
      const a = context.own.alumni;
      return lang === 'en'
        ? `Your graduate tracking record shows employment status: ${a.status || 'not set'}${a.company ? `, company: ${a.company}` : ''}. Update it in Graduate Tracking > My Employment Information.`
        : `Sa graduate tracking record mo, employment status: ${a.status || 'hindi pa naka-set'}${a.company ? `, company: ${a.company}` : ''}. Ma-update ito sa Graduate Tracking > My Employment Information.`;
    }
    return lang === 'en'
      ? `Graduate Tracking is in the sidebar. Alumni update their own employment and education information. Staff and administrators can review the linked records.`
      : `Nasa sidebar ang Graduate Tracking. Ina-update ng alumni ang sarili nilang employment at education information. Review ito ng Staff o Administrator.`;
  }

  if (topic === 'users' && !isAdmin(user)) {
    return lang === 'en'
      ? 'User & Access Management is available only to the System Administrator. I cannot open or change other accounts for you.'
      : 'Ang User & Access Management ay para sa System Administrator lang. Hindi ko pwedeng buksan o baguhin ang ibang account.';
  }

  if (topic === 'reports' && isAlumni(user)) {
    return lang === 'en'
      ? 'System Reports are for the System Administrator. Alumni can view their own request status, events, and jobs instead.'
      : 'Ang System Reports ay para sa System Administrator. Ang alumni ay tumitingin ng sariling request status, events, at jobs.';
  }

  if (isAdmin(user) || isStaff(user)) {
    if (/pending|how many|count/.test(String(text).toLowerCase())) {
      return lang === 'en'
        ? `Operational counts: ${context.operational.pendingTranscripts} pending/processing transcripts, ${context.operational.pendingReprints} certificate reprints, ${context.operational.alumni} alumni records.`
        : `Operational counts: ${context.operational.pendingTranscripts} pending/processing transcripts, ${context.operational.pendingReprints} certificate reprints, ${context.operational.alumni} alumni records.`;
    }
  }

  return lang === 'en'
    ? `I can help with document requests, request status, graduate tracking, jobs, events, surveys, announcements, profile, and settings. If you are asking about a specific item, tell me which one or continue from what we were discussing.`
    : `Pwede kitang tulungan sa document requests, status, graduate tracking, jobs, events, surveys, announcements, profile, at settings. Kung may tinutukoy kang specific item, sabihin mo o ituloy natin yung pinag-usapan.`;
}

export function buildAssistantSystemPrompt(user, context, language) {
  const role = normalizeRole(user?.role);
  const lines = [
    'You are the AI Chat Support assistant of the St. Agnes Academy of Caloocan Alumni Management System.',
    'Roles in this system: System Administrator, Staff, Alumni. There is no separate Registrar role.',
    `The current user is ${user?.name || 'a signed-in user'} with role ${role}.`,
    'Use conversation history. Short follow-ups like "where?", "how?", "ano kailangan?" refer to the current topic.',
    'Do not ask again for information the user already gave.',
    'Reply in the user\'s language: English, Filipino, or Taglish. Stay in that language.',
    'Give numbered steps for how-to questions. Explain statuses in simple words.',
    'Only describe features that exist. Do not invent GCash, live SMS delivery, or live Gmail sending.',
    'SMS and email pages log messages inside the system unless a provider is configured.',
    'AI Chat uses OpenAI only when OPENAI_API_KEY is configured; otherwise use this knowledge.',
    'Never reveal another person\'s records. Alumni may only hear about their own linked records.',
    'Staff cannot manage users, roles, or system-wide settings. Admin can.',
    'Navigation uses the real sidebar: Dashboard, Alumni Management, Document Requests, Graduate Tracking, Career Management, Alumni Engagement, Communications, AI Services, Reports or System Reports, User & Access Management (admin), Profile, Settings.',
    language !== 'en' ? 'Answer in natural Filipino or Taglish.' : 'Answer in clear English.',
    'If you cannot resolve a personal case from the data, say so and tell the user to contact staff. Do not pretend a ticket was sent.'
  ];
  if (isAlumni(user) && context.own) {
    const t = (context.own.transcripts || [])[0];
    const r = (context.own.reprints || [])[0];
    if (t) lines.push(`Authorized own transcript request #${t.id} status ${t.status}.`);
    else lines.push('This alumni has no transcript request on file.');
    if (r) lines.push(`Authorized own reprint request #${r.id} status ${r.status}.`);
    if (context.own.alumni) lines.push(`Own employment status: ${context.own.alumni.status || 'not set'}.`);
  }
  if ((isAdmin(user) || isStaff(user)) && context.operational) {
    lines.push(`Operational: ${context.operational.pendingTranscripts} pending transcripts, ${context.operational.pendingReprints} pending reprints, ${context.operational.alumni} alumni.`);
  }
  return lines.join('\n');
}

export function conversationTitle(text) {
  const clean = String(text || 'Conversation').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 60) || 'Conversation';
}
