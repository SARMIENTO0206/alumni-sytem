import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, createSession, destroySession, mapUser } from '../db.js';
import { requireAuth } from '../auth.js';

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
  if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

  const token = createSession(row.id);
  return res.json({ token, user: mapUser({ ...row }) });
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
    contact || ''
  );

  // Also register the new alumnus in the alumni demographic table.
  db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated)
     VALUES (?, ?, ?, 'Employed', '', '', ?, 'Not Related', '', 'Local', ?, ?)`
  ).run(
    name,
    batch || String(new Date().getFullYear()),
    program || '',
    contact || '',
    autoStudentId,
    new Date().toISOString().split('T')[0]
  );

  const token = createSession(info.lastInsertRowid);
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  return res.status(201).json({ token, user });
});

/** GET /api/auth/me - current authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** POST /api/auth/logout - revokes the current session token. */
router.post('/logout', requireAuth, (req, res) => {
  destroySession(req.token);
  res.json({ ok: true });
});

export default router;