import { Router } from 'express';
import { db } from '../db.js';
import { isAlumni, requireRole } from '../auth.js';

const staffOrAdmin = requireRole('admin', 'staff');

const router = Router();

/** GET /api/reports/summary - dashboard roll-up stats across modules. */
router.get('/summary', staffOrAdmin, (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;

  res.json({
    timestamp: new Date().toISOString(),
    alumni: {
      total: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = ''"),
      employed: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status = 'Employed'"),
      selfEmployed: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Self-employed','Freelance')"),
      seekingEmployment: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Unemployed','Seeking Employment')"),
      furtherStudies: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Further Studies','Post-grad','Postgraduate','Technical/Vocational Training')"),
      notCurrentlySeeking: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status = 'Not Currently Seeking'"),
      noData: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND (status IS NULL OR status = '' OR status = 'No Data')")
    },
    transcriptRequests: {
      total: count('SELECT COUNT(*) AS n FROM transcript_requests'),
      pending: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Pending'"),
      released: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status = 'Released'")
    },
    reprints: count('SELECT COUNT(*) AS n FROM reprints'),
    placements: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Employed','Self-employed')"),
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
    recentAlumni: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = ''"),
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
    alumni: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = ''"),
    pendingRequests: count("SELECT COUNT(*) AS n FROM transcript_requests WHERE status IN ('Pending','Processing')")
      + count("SELECT COUNT(*) AS n FROM reprints WHERE status IN ('Pending','Processing')"),
    employed: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Employed','Self-employed','Freelance')"),
    events: count('SELECT COUNT(*) AS n FROM events'),
    jobs: count("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'"),
    placements: count("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = '' AND status IN ('Employed','Self-employed')")
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
    verificationStats: db.prepare("SELECT COUNT(*) AS n FROM alumni WHERE COALESCE(archived_at, '') = ''").get().n,
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

export default router;