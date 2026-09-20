import { Router } from 'express';
import { db, mapAlumni } from '../db.js';
import { isAlumni, requireRole } from '../auth.js';

const staffOrAdmin = requireRole('admin', 'staff');
const adminOnly = requireRole('admin');

const router = Router();

/** GET /api/reports/summary - dashboard roll-up stats across modules. */
router.get('/summary', staffOrAdmin, (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;

  res.json({
    timestamp: new Date().toISOString(),
    alumni: {
      total: count('SELECT COUNT(*) AS n FROM alumni'),
      employed: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Employed'"),
      unemployed: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Unemployed'"),
      freelance: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Freelance'")
    },
    transcriptRequests: {
      total: count('SELECT COUNT(*) AS n FROM transcript_requests'),
      pending: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Pending'"),
      released: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Released'")
    },
    reprints: count('SELECT COUNT(*) AS n FROM reprints'),
    placements: count('SELECT COUNT(*) AS n FROM placements'),
    events: count('SELECT COUNT(*) AS n FROM events'),
    reunions: count('SELECT COUNT(*) AS n FROM reunions'),
    donations: count('SELECT COUNT(*) AS n FROM donations'),
    newsletters: count('SELECT COUNT(*) AS n FROM newsletters'),
    notifications: count('SELECT COUNT(*) AS n FROM notifications'),
    feedback: count('SELECT COUNT(*) AS n FROM feedback')
  });
});

/** GET /api/reports/operational - staff limited reports (no tracer / admin exports). */
router.get('/operational', staffOrAdmin, (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    pendingTranscripts: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status IN ('Pending','Processing')"),
    pendingReprints: count("SELECT COUNT(*) AS n FROM reprints WHERE status IN ('Pending','Processing')"),
    readyForRelease: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status IN ('Approved','Ready for Release')")
      + count("SELECT COUNT(*) AS n FROM reprints WHERE status IN ('Approved','Ready for Release')"),
    upcomingEvents: count("SELECT COUNT(*) AS n FROM events WHERE status IN ('Upcoming','Published','Open for Registration')"),
    publishedJobs: count("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'"),
    recentAlumni: count("SELECT COUNT(*) AS n FROM alumni"),
    surveyResponses: count('SELECT COUNT(*) AS n FROM feedback')
  });
});

/** GET /api/reports/dashboard - role-shaped live counts from the shared database. */
router.get('/dashboard', (req, res) => {
  const count = (sql, params = []) => db.prepare(sql).get(...params).n;
  if (isAlumni(req.user)) {
    const uid = Number(req.user.id);
    const aid = Number(req.user.alumniId || 0);
    return res.json({
      role: 'alumni',
      myTranscripts: count('SELECT COUNT(*) AS n FROM transcript_requests WHERE user_id = ? OR alumni_id = ?', [uid, aid]),
      myPending: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE (user_id = ? OR alumni_id = ?) AND status IN ('Pending','Processing')", [uid, aid])
        + count("SELECT COUNT(*) AS n FROM reprints WHERE (user_id = ? OR alumni_id = ?) AND status IN ('Pending','Processing')", [uid, aid]),
      myEvents: count('SELECT COUNT(*) AS n FROM events'),
      publishedJobs: count("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'"),
      myNotifications: count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [uid])
    });
  }
  res.json({
    role: req.user.role,
    alumni: count('SELECT COUNT(*) AS n FROM alumni'),
    pendingRequests: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status IN ('Pending','Processing')")
      + count("SELECT COUNT(*) AS n FROM reprints WHERE status IN ('Pending','Processing')"),
    employed: count("SELECT COUNT(*) AS n FROM alumni WHERE status = 'Employed'"),
    events: count('SELECT COUNT(*) AS n FROM events'),
    jobs: count("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'"),
    placements: count('SELECT COUNT(*) AS n FROM placements')
  });
});

/** GET /api/reports/registrar - registrar performance / fulfillment stats. */
router.get('/registrar', staffOrAdmin, (req, res) => {
  const pending = db.prepare("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Pending'").get().n;
  const approved = db.prepare("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Approved'").get().n;
  const released = db.prepare("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Released'").get().n;
  const rejected = db.prepare("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Rejected'").get().n;
  const reprintPending = db.prepare("SELECT COUNT(*) AS n FROM reprints WHERE status = 'Pending'").get().n;

  res.json({
    verificationStats: db.prepare('SELECT COUNT(*) AS n FROM alumni').get().n,
    pendingRequests: pending,
    approvedRequests: approved,
    releasedRequests: released,
    rejectedRequests: rejected,
    reprintPending,
    fulfillmentRate: (pending + approved + released + rejected) > 0
      ? Math.round((released / (pending + approved + released + rejected)) * 100)
      : 0
  });
});

/* --------------------------- CHED Tracer Study --------------------------- */
/* Commission on Higher Education (CHED) graduate tracer study - compliance report. */

const TRACER_HEADERS = [
  'No.', 'Full Name', 'Sex', 'Year Graduated', 'Degree / Program',
  'Employment Status', 'Occupation / Job Title', 'Company / Employer',
  'Time to First Job', 'Field of Study Relevance', 'Location (Local/Abroad)',
  'Further / Higher Studies', 'Remarks'
];

function toTracerRows() {
  const rows = db.prepare('SELECT * FROM alumni ORDER BY batch ASC, name ASC').all();
  return rows.map((a, i) => {
    const furtherStudies = (a.status || '').toLowerCase().includes('further') ? 'Yes' : 'No';
    const relevance = a.relevance || 'Not Indic';
    const status = a.status || 'Not Indic';
    const occupation = a.status === 'Unemployed' ? '—' : (a.job_title || '—');
    return [
      String(i + 1),
      a.name,
      'Not Indic (optional)',
      a.batch || '',
      a.program || '',
      status,
      occupation,
      a.company || '—',
      a.time_to_first || 'Not Indic',
      relevance,
      a.location || 'Local',
      furtherStudies,
      `Student ID: ${a.student_id || 'N/A'} | Last updated: ${a.last_updated || 'N/A'}`
    ];
  });
}

/** GET /api/reports/tracer-study - CHED tracer study data as JSON. */
router.get('/tracer-study', adminOnly, (req, res) => {
  res.json({
    institution: 'St. Agnes Academy of Caloocan',
    reportTitle: 'Graduate Tracer Study Report (CHED Compliance)',
    generatedAt: new Date().toISOString(),
    headers: TRACER_HEADERS,
    rows: toTracerRows()
  });
});

/** GET /api/reports/tracer-study/download - download the CHED tracer study CSV. */
router.get('/tracer-study/download', adminOnly, (req, res) => {
  const escape = (value) => {
    const v = value == null ? '' : String(value);
    if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const lines = [];
  lines.push('"ST. AGNES ACADEMY OF CALOOCAN - GRADUATE TRACER STUDY REPORT"');
  lines.push('"Prepared in accordance with CHED graduate tracer study guidelines"');
  lines.push(`"Date Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}"`);
  lines.push('');
  lines.push(TRACER_HEADERS.map(escape).join(','));
  for (const row of toTracerRows()) {
    lines.push(row.map(escape).join(','));
  }

  const csv = '\uFEFF' + lines.join('\r\n'); // BOM so Excel opens UTF-8 correctly
  const filename = `saa-trader-study-${new Date().toISOString().split('T')[0]}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/** GET /api/reports/payments - staff/admin payment summary. */
router.get('/payments', staffOrAdmin, (req, res) => {
  const q = req.query || {};
  let rows = db.prepare('SELECT * FROM payments ORDER BY id DESC').all();
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  if (q.method) rows = rows.filter((r) => String(r.payment_method || '') === String(q.method));
  if (q.relatedType) rows = rows.filter((r) => r.related_type === q.relatedType);
  if (q.reference) {
    const needle = String(q.reference).toLowerCase();
    rows = rows.filter((r) => String(r.reference_id || r.gateway_payment_id || r.request_code || '').toLowerCase().includes(needle));
  }
  if (q.from) rows = rows.filter((r) => String(r.created_at || '') >= String(q.from));
  if (q.to) rows = rows.filter((r) => String(r.created_at || '').slice(0, 10) <= String(q.to));
  const sum = (status) => rows.filter((r) => r.status === status).length;
  const paidAmount = rows.filter((r) => r.status === 'paid').reduce((n, r) => n + Number(r.amount_centavos || 0), 0);
  res.json({
    summary: {
      total: rows.length,
      paid: sum('paid'),
      pending: sum('pending') + sum('awaiting_payment') + sum('processing'),
      failed: sum('failed'),
      cancelled: sum('cancelled'),
      expired: sum('expired'),
      totalPaidAmount: (paidAmount / 100).toFixed(2)
    },
    payments: rows.slice(0, 200).map((r) => ({
      id: r.id,
      requestCode: r.request_code,
      relatedType: r.related_type,
      relatedId: r.related_id,
      amount: (Number(r.amount_centavos || 0) / 100).toFixed(2),
      status: r.status,
      method: r.payment_method,
      referenceId: r.reference_id || r.gateway_payment_id,
      paidAt: r.paid_at,
      createdAt: r.created_at,
      userId: r.user_id
    }))
  });
});

export default router;