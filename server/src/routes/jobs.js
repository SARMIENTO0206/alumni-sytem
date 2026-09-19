import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();
const jobStatuses = ['Open', 'Closed', 'Draft'];
const applicationStatuses = ['Submitted', 'Under Review', 'Shortlisted', 'Rejected', 'Hired'];

const mapJob = (row) => ({
  id: row.id, title: row.title, company: row.company, location: row.location,
  category: row.category, employmentType: row.employment_type, description: row.description,
  status: row.status, postedBy: row.posted_by, createdAt: row.created_at, updatedAt: row.updated_at
});

const mapApplication = (row) => ({
  id: row.id, jobId: row.job_id, jobTitle: row.job_title, company: row.company,
  applicantUserId: row.applicant_user_id, name: row.name, email: row.email,
  resume: row.resume, coverMessage: row.cover_message, status: row.status,
  appliedAt: row.applied_at, updatedAt: row.updated_at
});

const applicationQuery = `
  SELECT a.*, j.title AS job_title, j.company
  FROM job_applications a JOIN job_postings j ON j.id = a.job_id
`;

router.get('/jobs', (req, res) => {
  const rows = db.prepare('SELECT * FROM job_postings WHERE status != \'Draft\' ORDER BY id DESC').all();
  res.json({ jobs: rows.map(mapJob) });
});

router.get('/jobs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM job_postings WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Job posting not found.' });
  res.json({ job: mapJob(row) });
});

router.post('/jobs', requireRole('admin', 'registrar'), (req, res) => {
  const { title, company, location, category, employmentType, description, status } = req.body || {};
  if (!title || !company) return res.status(400).json({ error: 'Job title and company are required.' });
  if (status && !jobStatuses.includes(status)) return res.status(400).json({ error: 'Invalid job status value.' });

  const info = db.prepare(
    `INSERT INTO job_postings
     (title, company, location, category, employment_type, description, status, posted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(title, company, location || '', category || 'General', employmentType || 'Full-Time',
    description || '', status || 'Open', req.user.id);
  res.status(201).json({ job: mapJob(db.prepare('SELECT * FROM job_postings WHERE id = ?').get(info.lastInsertRowid)) });
});

router.put('/jobs/:id', requireRole('admin', 'registrar'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM job_postings WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Job posting not found.' });
  const { title, company, location, category, employmentType, description, status } = req.body || {};
  if (status && !jobStatuses.includes(status)) return res.status(400).json({ error: 'Invalid job status value.' });
  db.prepare(
    `UPDATE job_postings SET title = ?, company = ?, location = ?, category = ?, employment_type = ?,
     description = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title ?? existing.title, company ?? existing.company, location ?? existing.location,
    category ?? existing.category, employmentType ?? existing.employment_type, description ?? existing.description,
    status ?? existing.status, id);
  res.json({ job: mapJob(db.prepare('SELECT * FROM job_postings WHERE id = ?').get(id)) });
});

router.delete('/jobs/:id', requireRole('admin', 'registrar'), (req, res) => {
  const info = db.prepare('DELETE FROM job_postings WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Job posting not found.' });
  res.status(204).end();
});

router.post('/jobs/:id/applications', requireRole('alumni'), (req, res) => {
  const job = db.prepare('SELECT * FROM job_postings WHERE id = ? AND status = \'Open\'').get(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Open job posting not found.' });
  const { name, email, resume, coverMessage } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Applicant name and email are required.' });
  const duplicate = db.prepare(
    'SELECT id FROM job_applications WHERE job_id = ? AND applicant_user_id = ? AND status != \'Rejected\''
  ).get(job.id, req.user.id);
  if (duplicate) return res.status(409).json({ error: 'You already have an active application for this job.' });
  const info = db.prepare(
    `INSERT INTO job_applications (job_id, applicant_user_id, name, email, resume, cover_message)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(job.id, req.user.id, name, email, resume || 'Standard Profile Application', coverMessage || '');
  const row = db.prepare(`${applicationQuery} WHERE a.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ application: mapApplication(row) });
});

router.get('/applications', (req, res) => {
  const isStaff = ['admin', 'registrar'].includes(req.user.role);
  const rows = isStaff
    ? db.prepare(`${applicationQuery} ORDER BY a.id DESC`).all()
    : db.prepare(`${applicationQuery} WHERE a.applicant_user_id = ? ORDER BY a.id DESC`).all(req.user.id);
  res.json({ applications: rows.map(mapApplication) });
});

router.get('/jobs/:id/applications', requireRole('admin', 'registrar'), (req, res) => {
  const rows = db.prepare(`${applicationQuery} WHERE a.job_id = ? ORDER BY a.id DESC`).all(Number(req.params.id));
  res.json({ applications: rows.map(mapApplication) });
});

router.put('/applications/:id/status', requireRole('admin', 'registrar'), (req, res) => {
  const { status } = req.body || {};
  if (!applicationStatuses.includes(status)) return res.status(400).json({ error: 'Invalid application status value.' });
  const info = db.prepare("UPDATE job_applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Job application not found.' });
  const row = db.prepare(`${applicationQuery} WHERE a.id = ?`).get(Number(req.params.id));
  res.json({ application: mapApplication(row) });
});

export default router;
