import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomInt } from 'node:crypto';
import { db, createSession, destroySession, destroyUserSessions, generateUserCode, mapUser, mapAlumni, writeAudit, writeLoginLog, linkAlumniAccount } from '../db.js';
import { isAlumni, requireAuth } from '../auth.js';
import { normalizePhMobile } from '../phone.js';
import { mailConfig, sendMail } from '../mail.js';
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

function hashRegistrationOtp(email, otp) {
  return createHmac('sha256', process.env.REGISTRATION_OTP_SECRET || '')
    .update(`${email}:${otp}`)
    .digest('hex');
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

/* ---------------------------------------------------------------------------
 * Registered email changes are verified before they become the active address.
 * The registered address is the recipient of email notifications and the key the
 * system matches when an inbound inquiry is answered with AI assistance.
 * ------------------------------------------------------------------------- */
const EMAIL_CHANGE_TTL_MINUTES = 30;
const emailChangeAttempts = new Map();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/** Pending (unused, unexpired) verified email change for an account. */
function pendingEmailChangeFor(userId) {
  const row = db.prepare(
    `SELECT new_email AS newEmail, expires_at AS expiresAt FROM email_change_requests
     WHERE user_id = ? AND used_at IS NULL AND expires_at > datetime('now')
     ORDER BY id DESC`
  ).get(userId);
  return row || null;
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

/** POST /api/auth/send-otp - send a persistent, single-use registration code. */
router.post('/send-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@gmail\.com$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid personal Gmail address.' });
  }
  if (!process.env.REGISTRATION_OTP_SECRET || !mailConfig().configured) {
    return res.status(503).json({ error: 'Email verification is not configured. Please contact the system administrator.' });
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    const registered = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (registered) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'This email address is already registered.' });
    }

    const now = Date.now();
    const previous = db.prepare('SELECT sent_at FROM registration_otps WHERE email = ?').get(email);
    const elapsed = previous ? now - Date.parse(previous.sent_at) : Infinity;
    if (elapsed < 60_000) {
      db.exec('ROLLBACK');
      return res.status(429).json({ error: `Please wait ${Math.ceil((60_000 - elapsed) / 1000)} seconds before requesting another code.` });
    }

    const otp = String(randomInt(100000, 1000000));
    const otpHash = hashRegistrationOtp(email, otp);
    const sentAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 5 * 60_000).toISOString();
    db.prepare(
      `INSERT INTO registration_otps (email, otp_hash, expires_at, sent_at, attempts)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(email) DO UPDATE SET otp_hash = excluded.otp_hash,
         expires_at = excluded.expires_at, sent_at = excluded.sent_at, attempts = 0`
    ).run(email, otpHash, expiresAt, sentAt);
    db.exec('COMMIT');

    const delivery = await sendMail({
      to: email,
      subject: 'Alumni System - Registration OTP Code',
      text: `Your Alumni System registration verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden"><div style="padding:24px 28px;background:#801235;color:#ffffff"><p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase">Alumni Management System</p><h1 style="margin:10px 0 0;font-size:22px">Verify your email</h1></div><div style="padding:28px"><p style="margin:0 0 18px;line-height:1.6">Use this one-time code to continue your alumni registration:</p><div style="padding:16px;text-align:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#801235">${otp}</div><p style="margin:20px 0 0;line-height:1.6">This code expires in <strong>5 minutes</strong> and can only be used once. If you did not request it, you can ignore this email.</p><p style="margin:24px 0 0;color:#6b7280;font-size:12px">Please do not share this code with anyone.</p></div></div></div>`
    });

    if (!delivery.sent) {
      db.prepare('DELETE FROM registration_otps WHERE email = ? AND otp_hash = ?').run(email, otpHash);
      console.error('[auth] Registration OTP email was not accepted:', delivery.reason);
      return res.status(503).json({ error: 'Unable to send the verification email. Check the address or try again later.' });
    }
    return res.json({ ok: true, message: 'A verification code was sent to your Gmail address.' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
    console.error('[auth] Registration OTP request failed:', err.message);
    return res.status(500).json({ error: 'Unable to send a verification code right now.' });
  }
});

/** POST /api/auth/register-alumni - create an account only after email OTP verification. */
async function registerAlumni(req, res) {
  const {
    username, password, name, studentId, batch, contact, educationLevel, track, strand, lrn, address, consent, otp
  } = req.body || {};
  const email = normalizeEmail(req.body?.email);

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and full name are required.' });
  }
  const normalizedStudentId = String(studentId || '').trim();
  if (!batch || !educationLevel || !email) {
    return res.status(400).json({ error: 'Graduation year, educational level and Gmail address are required.' });
  }
  if (educationLevel !== 'SHS') {
    return res.status(400).json({ error: 'Registrations are open for Senior High School graduates only.' });
  }
  const allowedStrands = {
    Academic: ['STEM', 'ABM', 'HUMSS', 'GAS'],
    TVL: ['ICT', 'Home Economics', 'Industrial Arts', 'Agri-Fishery Arts'],
    Sports: ['Sports Track'],
    'Arts and Design': ['Arts and Design']
  };
  if (!allowedStrands[track]?.includes(strand)) {
    return res.status(400).json({ error: 'Select a valid SHS track and strand combination.' });
  }
  const graduationYear = Number(batch);
  if (!Number.isInteger(graduationYear) || graduationYear < 1960 || graduationYear > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Enter a valid graduation year.' });
  }
  if (!/^[^\s@]+@gmail\.com$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid personal Gmail address.' });
  }
  if (!/^\d{6}$/.test(String(otp || '').trim())) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code sent to your Gmail address.' });
  }
  if (consent !== true) {
    return res.status(400).json({ error: 'Please accept the privacy consent before submitting.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const avatar = String(name).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  /* The school record number is optional: the official Alumni ID is issued by
     the Registrar verification step, not self-declared at registration. */
  if (normalizedStudentId) {
  }

  let mobile = '';
  try {
    mobile = normalizePhMobile(contact);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let info;
  try {
    db.exec('BEGIN IMMEDIATE');
    const code = db.prepare('SELECT otp_hash, expires_at, attempts FROM registration_otps WHERE email = ?').get(email);
    if (!code || Date.parse(code.expires_at) <= Date.now()) {
      if (code) db.prepare('UPDATE registration_otps SET otp_hash = \'\', attempts = 3 WHERE email = ?').run(email);
      db.exec('COMMIT');
      return res.status(400).json({ error: 'This verification code is invalid or has expired. Request a new code.' });
    }
    if (code.attempts >= 3) {
      db.exec('COMMIT');
      return res.status(400).json({ error: 'Too many incorrect attempts. Request a new verification code.' });
    }
    if (hashRegistrationOtp(email, String(otp).trim()) !== code.otp_hash) {
      const attempts = code.attempts + 1;
      if (attempts >= 3) db.prepare('UPDATE registration_otps SET otp_hash = \'\', attempts = 3 WHERE email = ?').run(email);
      else db.prepare('UPDATE registration_otps SET attempts = ? WHERE email = ?').run(attempts, email);
      db.exec('COMMIT');
      return res.status(400).json({ error: attempts >= 3
        ? 'Too many incorrect attempts. Request a new verification code.'
        : `Incorrect verification code. ${3 - attempts} attempt${3 - attempts === 1 ? '' : 's'} remaining.` });
    }

    const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(String(username).trim());
    if (exists) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'Username already exists. Please pick a unique username.' });
    }
    const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (existingEmail) {
      db.prepare('DELETE FROM registration_otps WHERE email = ?').run(email);
      db.exec('COMMIT');
      return res.status(409).json({ error: 'This email address is already registered.' });
    }
    if (normalizedStudentId) {
      const duplicateStudentId = db.prepare(
        `SELECT id FROM users WHERE LOWER(student_id) = LOWER(?) AND TRIM(student_id) != ''`
      ).get(normalizedStudentId);
      if (duplicateStudentId) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'This school record number is already associated with an account. Contact the Registrar if you need help.' });
      }
    }

    info = db.prepare(
      `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact, status, school, education_level, grade_completed, track, strand, lrn, address, user_code)
       VALUES (?, ?, 'alumni', ?, ?, ?, ?, ?, ?, '', ?, ?, 'Pending Verification', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(username).trim(),
      bcrypt.hashSync(String(password), 10),
      name,
      `Alumni (Batch ${batch || new Date().getFullYear()})`,
      avatar,
      normalizedStudentId,
      batch || String(new Date().getFullYear()),
      strand || '',
      email,
      mobile,
      'St. Agnes Academy of Caloocan',
      'SHS',
      '',
      track || '',
      strand || '',
      lrn || '',
      address || '',
      generateUserCode('alumni')
    );
    db.prepare('DELETE FROM registration_otps WHERE email = ?').run(email);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
    console.error('[auth] Alumni registration failed:', err.message);
    return res.status(500).json({ error: 'Unable to complete registration right now.' });
  }

  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  return res.status(201).json({
    user,
    pendingVerification: true,
    message: 'Your registration was submitted and is pending Registrar verification.'
  });
}

router.post('/register-alumni', registerAlumni);
router.post('/register', registerAlumni);

/** GET /api/auth/me - current authenticated user. */
router.get('/me', requireAuth, (req, res) => {
  if (isAlumni(req.user)) linkAlumniAccount(req.user);
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  const alumni = user.alumniId
    ? mapAlumni(db.prepare('SELECT * FROM alumni WHERE id = ?').get(user.alumniId))
    : null;
  const pendingEmailChange = pendingEmailChangeFor(req.user.id);
  res.json({ user, alumni, pendingEmailChange });
});

/** POST /api/auth/logout - revokes the current session token. */
router.post('/logout', requireAuth, (req, res) => {
  writeLoginLog(req.user, 'logout');
  destroySession(req.token);
  res.json({ ok: true });
});

/**
 * POST /api/auth/profile/email/request - start a verified registered-email change.
 * The new address receives a one-time code; the registered email only moves after
 * that code is confirmed, so notifications never go to an unverified address.
 */
router.post('/profile/email/request', requireAuth, async (req, res) => {
  const newEmail = normalizeEmail(req.body?.email);
  if (!isValidEmail(newEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (isRateLimited(emailChangeAttempts, String(req.user.id))) {
    return res.status(429).json({ error: 'Too many verification requests. Please try again later.' });
  }
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Account not found.' });
  if (normalizeEmail(current.email) === newEmail) {
    return res.status(400).json({ error: 'This is already your registered email address.' });
  }
  const taken = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?').get(newEmail, req.user.id);
  if (taken) return res.status(409).json({ error: 'This email address is already registered to another account.' });

  db.prepare('UPDATE email_change_requests SET used_at = datetime(?) WHERE user_id = ? AND used_at IS NULL')
    .run(new Date().toISOString(), req.user.id);
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO email_change_requests (user_id, new_email, code_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, newEmail, hashResetOtp(code), expiresAt);

  const delivery = await sendMail({
    to: newEmail,
    subject: 'Confirm your new Alumni Portal email address',
    text: [
      `Your email verification code is ${code}.`,
      `It expires in ${EMAIL_CHANGE_TTL_MINUTES} minutes and can only be used once.`,
      'Your registered email address stays the same until you confirm this code.'
    ].join('\n'),
    userId: req.user.id
  });

  writeLoginLog({ id: req.user.id, username: req.user.username }, 'email_change_requested');
  const response = {
    ok: true,
    pendingEmail: newEmail,
    expiresAt,
    emailConfigured: mailConfig().configured,
    deliveryStatus: delivery.status,
    message: 'We sent a verification code to the new address. Your registered email changes only after you confirm it.'
  };
  /* Without an SMTP provider the code cannot be delivered, so it is returned to
     the signed-in account owner only, so the flow stays testable locally. */
  if (!mailConfig().configured) response.devCode = code;
  return res.status(202).json(response);
});

/** POST /api/auth/profile/email/verify - confirm the code and activate the new email. */
router.post('/profile/email/verify', requireAuth, (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit code sent to the new address.' });
  }
  const row = db.prepare(
    `SELECT * FROM email_change_requests
     WHERE code_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > datetime('now')`
  ).get(hashResetOtp(code), req.user.id);
  if (!row) return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
  const taken = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?')
    .get(normalizeEmail(row.new_email), req.user.id);
  if (taken) return res.status(409).json({ error: 'This email address is already registered to another account.' });

  const previous = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const updated = db.prepare('UPDATE email_change_requests SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(new Date().toISOString(), row.id);
  if (updated.changes !== 1) return res.status(400).json({ error: 'This verification code is invalid or has expired.' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(row.new_email, req.user.id);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (updatedUser.alumni_id) {
    db.prepare('UPDATE alumni SET email = ? WHERE id = ?').run(row.new_email, updatedUser.alumni_id);
  }
  writeAudit(req.user, 'update', 'email_change', req.user.id, row.new_email);
  writeLoginLog({ id: req.user.id, username: req.user.username }, 'email_change_verified');
  if (previous?.email) {
    sendMail({
      to: previous.email,
      subject: 'Your Alumni Portal email address was changed',
      text: `Hello ${previous.name || 'Alumni'},\n\nYour registered email address was changed to ${row.new_email}. If you did not make this change, contact the Alumni Affairs Office immediately.`,
      userId: req.user.id
    }).catch(() => {});
  }
  const alumni = updatedUser.alumni_id
    ? mapAlumni(db.prepare('SELECT * FROM alumni WHERE id = ?').get(updatedUser.alumni_id))
    : null;
  return res.json({
    ok: true,
    email: row.new_email,
    user: mapUser(updatedUser),
    alumni,
    message: 'Email address verified and updated.'
  });
});

/** POST /api/auth/profile/email/cancel - discard a pending verified email change. */
router.post('/profile/email/cancel', requireAuth, (req, res) => {
  const info = db.prepare('UPDATE email_change_requests SET used_at = datetime(?) WHERE user_id = ? AND used_at IS NULL')
    .run(new Date().toISOString(), req.user.id);
  res.json({ ok: true, cancelled: info.changes });
});

router.put('/profile', requireAuth, (req, res) => {
  const { name, email, contact, title, photoUrl, address } = req.body || {};
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'Account not found.' });
  /* The registered email only moves through the verified email-change flow. */
  if (normalizeEmail(email ?? existing.email) !== normalizeEmail(existing.email)) {
    return res.status(400).json({
      error: 'Changing your email address needs verification. Save your other details, then confirm the new address with the code we send to it.'
    });
  }
  const profileName = isAlumni(req.user) ? existing.name : (name ?? existing.name);
  const profileTitle = isAlumni(req.user) ? existing.title : (title ?? existing.title);
  let mobile = existing.contact;
  try {
    mobile = contact === undefined ? existing.contact : normalizePhMobile(contact);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  db.prepare(
    'UPDATE users SET name = ?, email = ?, contact = ?, title = ?, photo_url = ?, address = ? WHERE id = ?'
  ).run(
    profileName,
    existing.email,
    mobile,
    profileTitle,
    photoUrl ?? existing.photo_url,
    address ?? existing.address ?? '',
    req.user.id
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (isAlumni(req.user) && row.alumni_id) {
    db.prepare(
      `UPDATE alumni SET name = ?, contact = ?, email = ?, address = ?, last_updated = ? WHERE id = ?`
    ).run(
      existing.name,
      row.contact,
      row.email,
      row.address || '',
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