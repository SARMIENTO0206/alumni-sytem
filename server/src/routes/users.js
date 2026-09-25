import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, mapUser, writeAudit } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

const ALLOWED_ROLES = ['admin', 'staff', 'alumni'];
const ALLOWED_STATUS = ['Active', 'Pending Verification', 'Inactive', 'Suspended', 'Locked'];

router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  res.json({ users: rows.map(mapUser) });
});

router.post('/', requireRole('admin'), (req, res) => {
  const { username, password, name, role, email, contact, title, studentId, batch, program, status } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and full name are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  const nextRole = ALLOWED_ROLES.includes(role) ? role : 'alumni';
  const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(String(username).trim());
  if (exists) return res.status(409).json({ error: 'Username already exists.' });

  const avatar = String(name).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const info = db.prepare(
    `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`
  ).run(
    String(username).trim(),
    bcrypt.hashSync(String(password), 10),
    nextRole,
    name,
    title || (nextRole === 'admin' ? 'System Administrator' : nextRole === 'staff' ? 'Staff' : 'Alumnus'),
    avatar,
    studentId || '',
    batch || '',
    program || '',
    email || '',
    contact || '',
    ALLOWED_STATUS.includes(status) ? status : 'Active'
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  writeAudit(req.user, 'create', 'users', row.id, row.username);
  res.status(201).json({ user: mapUser(row) });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User account not found.' });
  const { name, role, email, contact, title, studentId, batch, program, status, password } = req.body || {};
  const nextRole = role && ALLOWED_ROLES.includes(role) ? role : existing.role === 'registrar' ? 'staff' : existing.role;
  db.prepare(
    `UPDATE users SET name = ?, role = ?, email = ?, contact = ?, title = ?, student_id = ?, batch = ?, program = ?, status = ? WHERE id = ?`
  ).run(
    name ?? existing.name,
    nextRole,
    email ?? existing.email,
    contact ?? existing.contact,
    title ?? existing.title,
    studentId ?? existing.student_id,
    batch ?? existing.batch,
    program ?? existing.program,
    ALLOWED_STATUS.includes(status) ? status : (existing.status || 'Active'),
    id
  );
  if (password && String(password).length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), id);
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  writeAudit(req.user, 'update', 'users', id, row.username);
  res.json({ user: mapUser(row) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (Number(req.user.id) === id) {
    return res.status(400).json({ error: 'You cannot delete your own account while signed in.' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'User account not found.' });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  writeAudit(req.user, 'delete', 'users', id, '');
  res.status(204).end();
});

export default router;
