import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'node:crypto';
import { db, createSession, destroySession, destroyUserSessions, mapUser, mapAlumni, writeAudit, writeLoginLog, linkAlumniAccount } from '../db.js';
import { isAlumni, requireAuth } from '../auth.js';
import { normalizePhMobile } from '../phone.js';
import { sendMail } from '../mail.js';
import { sendSms } from '../sms.js';

const router = Router();
const resetRequestAttempts = new Map();
const resetOtpAttempts = new Map();
const RESET_TTL_MINUTES = 30;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

function hashResetOtp(otp) {
  return createHash('sha256').update(String(otp)).digest('hex');
}

function isRateLimited(store, key) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.startedAt >= RESET_WINDOW_MS) {
    store.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RESET_MAX_ATTEMPTS;
}

function genericResetResponse(res) {
  return res.status(202).json({
    message: 'If an account exists for that information, we’ll send password-reset instructions.'
  });
}

function passwordPolicyError(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include an uppercase letter, a lowercase letter, and a number.';
  }
  return '';
}

router.post('/password-reset/request', async (req, res) => {
  const identifier = String(req.body?.identifier || '').trim();
  const key = identifier.toLowerCase() || 'empty';
  if (isRateLimited(resetRequestAttempts, `${req.ip}:${key}`)) return genericResetResponse(res);

  try {
    if (!identifier) return genericResetResponse(res);
    const user = db.prepare(
      `SELECT * FROM users
       WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR contact = ?`
    ).get(identifier, identifier, identifier);
    if (!user || (user.status && user.status !== 'Active')) return genericResetResponse(res);
    const wantsSms = /^[+()\d\s-]{7,}$/.test(identifier) && user.contact;
    const channel = wantsSms ? 'sms' : (user.email ? 'email' : (user.contact ? 'sms' : ''));
    const destination = channel === 'email' ? user.email : user.contact;
    if (!channel || !destination) return genericResetResponse(res);

    db.prepare('UPDATE password_reset_otps SET used_at = datetime(?) WHERE user_id = ? AND used_at IS NULL')
      .run(new Date().toISOString(), user.id);
    const otp = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO password_reset_otps (otp_hash, user_id, channel, destination, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(hashResetOtp(otp), user.id, channel, destination, expiresAt);
    if (channel === 'email') {
      await sendMail({
        to: destination,
        subject: 'Your Alumni Portal password reset code',
        text: `Your Alumni Portal password reset code is ${otp}. It expires in 30 minutes and can only be used once. If you did not request this, ignore this message.`,
        userId: user.id
      });
    } else {
      await sendSms({
        to: destination,
        message: `Your Alumni Portal password reset code is ${otp}. It expires in 30 minutes.`,
        userId: user.id
      });
    }
    writeLoginLog({ id: user.id, username: user.username }, 'password_reset_requested');
    return genericResetResponse(res);
  } catch (err) {
    console.error('[auth] Password reset request failed:', err.message);
    return genericResetResponse(res);
  }
});

router.post('/password-reset/verify', (req, res) => {
  const otp = String(req.body?.otp || '').trim();
  if (!/^\d{6}$/.test(otp) || isRateLimited(resetOtpAttempts, req.ip)) {
    return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
  }
  const row = db.prepare(
    `SELECT otp_hash FROM password_reset_otps
     WHERE otp_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
  ).get(hashResetOtp(otp));
  if (!row) return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
  return res.json({ valid: true });
});

router.post('/password-reset/complete', (req, res) => {
  const otp = String(req.body?.otp || '').trim();
  const policyError = passwordPolicyError(req.body?.newPassword);
  if (!/^\d{6}$/.test(otp) || policyError || isRateLimited(resetOtpAttempts, req.ip)) {
    return res.status(400).json({ error: policyError || 'This verification code is invalid or has expired.' });
  }
  const otpHash = hashResetOtp(otp);
  const row = db.prepare(
    `SELECT * FROM password_reset_otps
     WHERE otp_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
  ).get(otpHash);
  if (!row) return res.status(400).json({ error: 'This verification code is invalid or has expired.' });

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(String(req.body.newPassword), 12);
  const updated = db.prepare(
    `UPDATE password_reset_otps SET used_at = ?
     WHERE otp_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
  ).run(now, otpHash);
  if (updated.changes !== 1) return res.status(400).json({ error: 'This verification code is invalid or has expired.' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.user_id);
  destroyUserSessions(row.user_id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  writeLoginLog({ id: user.id, username: user.username }, 'password_reset_completed');
  writeAudit({ id: user.id, role: user.role, username: user.username }, 'update', 'password_reset', user.id, 'Password reset completed.');
  sendMail({
    to: user.email,
    subject: 'Your Alumni Portal password was changed',
    text: `Hello ${user.name || 'Alumni'},\n\nYour Alumni Portal password was changed. If you did not make this change, contact the Alumni Affairs Office immediately.`,
    userId: user.id
  }).catch(() => {});
  return res.json({ ok: true, message: 'Your password has been changed. You can now sign in.' });
});

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
    if (row.status === 'Pending Verification') {
      return res.status(403).json({ error: 'Your registration is pending Registrar verification. You will be able to sign in after approval.' });
    }
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
    username, password, name, studentId, batch, program, email, contact, school, strand, lrn, address, consent
  } = req.body || {};

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and full name are required.' });
  }
  if (!school || !strand || !batch) {
    return res.status(400).json({ error: 'School, graduation year and SHS strand/track are required.' });
  }
  if (consent !== true) {
    return res.status(400).json({ error: 'Please accept the privacy consent before submitting.' });
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
    `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact, status, school, strand, lrn, address)
     VALUES (?, ?, 'alumni', ?, ?, ?, ?, ?, ?, '', ?, ?, 'Pending Verification', ?, ?, ?, ?)`
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
    mobile,
    school || '',
    strand || '',
    lrn || '',
    address || ''
  );

  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  return res.status(201).json({
    user,
    pendingVerification: true,
    message: 'Your registration was submitted and is pending Registrar verification.'
  });
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