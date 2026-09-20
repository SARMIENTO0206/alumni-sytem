import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, createSession, destroySession, mapUser, mapAlumni, writeAudit, writeLoginLog, linkAlumniAccount } from '../db.js';
import { isAlumni, requireAuth } from '../auth.js';
import { normalizePhMobile } from '../phone.js';

const router = Router();

/** POST /api/auth/login - verifies a bcrypt-hashed password, creates a session token. */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(String(username).trim());
  if (!row) return res.status(401).json({ error: 'Invalid username or password.' });

  const ok = bcrypt.compareSync(String(password), row.password_hash);
  if (!ok) {
    writeLoginLog({ id: row.id, username: row.username }, 'failed_login');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (row.status && row.status !== 'Active') {
    writeLoginLog({ id: row.id, username: row.username }, 'blocked_login');
    return res.status(403).json({ error: `This account is ${row.status}. Contact the system administrator.` });
  }

  const token = createSession(row.id);
  if (row.role === 'alumni') linkAlumniAccount(row);
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id));
  writeLoginLog(user, 'login');
  return res.json({ token, user });
});

/** POST /api/auth/register - self-registration for alumni (bcrypt-hashes the password). */
router.post('/register', (req, res) => {
  const {
    username, password, name, studentId, batch, program, email, contact
  } = req.body || {};

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and full name are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(String(username).trim());
  if (exists) return res.status(409).json({ error: 'Username already exists. Please pick a unique username.' });

  const avatar = String(name).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const autoStudentId = studentId || `SAA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  let mobile = '';
  try {
    mobile = normalizePhMobile(contact);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const info = db.prepare(
    `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact)
     VALUES (?, ?, 'alumni', ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    String(username).trim(),
    bcrypt.hashSync(String(password), 10),
    name,
    `Alumnus (Batch ${batch || new Date().getFullYear()})`,
    avatar,
    autoStudentId,
    batch || String(new Date().getFullYear()),
    program || '',
    email || '',
    mobile
  );

  linkAlumniAccount(info.lastInsertRowid);
  const token = createSession(info.lastInsertRowid);
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  return res.status(201).json({ token, user });
});

/** GET /api/auth/me - current authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  if (isAlumni(req.user)) linkAlumniAccount(req.user);
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  const alumni = user.alumniId
    ? mapAlumni(db.prepare('SELECT * FROM alumni WHERE id = ?').get(user.alumniId))
    : null;
  res.json({ user, alumni });
});

/** POST /api/auth/logout - revokes the current session token. */
router.post('/logout', requireAuth, (req, res) => {
  writeLoginLog(req.user, 'logout');
  destroySession(req.token);
  res.json({ ok: true });
});

router.put('/profile', requireAuth, (req, res) => {
  const { name, email, contact, title, photoUrl, address, batch, program, employment, company, jobTitle } = req.body || {};
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'Account not found.' });
  let mobile = existing.contact;
  try {
    mobile = contact === undefined ? existing.contact : normalizePhMobile(contact);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  db.prepare(
    'UPDATE users SET name = ?, email = ?, contact = ?, title = ?, photo_url = ?, address = ?, batch = ?, program = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    email ?? existing.email,
    mobile,
    title ?? existing.title,
    photoUrl ?? existing.photo_url,
    address ?? existing.address ?? '',
    batch ?? existing.batch,
    program ?? existing.program,
    req.user.id
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (isAlumni(req.user) && row.alumni_id) {
    const alumni = db.prepare('SELECT * FROM alumni WHERE id = ?').get(row.alumni_id);
    db.prepare(
      `UPDATE alumni SET name = ?, contact = ?, email = ?, address = ?, batch = ?, program = ?,
       status = ?, company = ?, job_title = ?, last_updated = ? WHERE id = ?`
    ).run(
      row.name,
      row.contact,
      row.email,
      row.address || '',
      batch ?? alumni?.batch ?? row.batch,
      program ?? alumni?.program ?? row.program,
      employment ?? alumni?.status ?? 'Employed',
      company ?? alumni?.company ?? '',
      jobTitle ?? alumni?.job_title ?? '',
      new Date().toISOString().split('T')[0],
      row.alumni_id
    );
  }
  writeAudit(req.user, 'update', 'profile', req.user.id, req.user.username);
  const alumni = row.alumni_id ? mapAlumni(db.prepare('SELECT * FROM alumni WHERE id = ?').get(row.alumni_id)) : null;
  res.json({ user: mapUser(row), alumni });
});

router.put('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(String(currentPassword), row.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(newPassword), 10), req.user.id);
  writeLoginLog(req.user, 'password_change');
  writeAudit(req.user, 'update', 'password', req.user.id, req.user.username);
  res.json({ ok: true });
});

router.get('/login-logs', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, action, created_at FROM login_logs WHERE user_id = ? ORDER BY id DESC LIMIT 20'
  ).all(req.user.id);
  res.json({
    logs: rows.map((r) => ({ id: r.id, action: r.action, createdAt: r.created_at }))
  });
});

export default router;