import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const dbFile = join(DATA_DIR, 'saa.db');
export const db = new DatabaseSync(dbFile);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL,
      name          TEXT NOT NULL,
      title         TEXT DEFAULT '',
      avatar        TEXT DEFAULT '',
      student_id    TEXT DEFAULT '',
      batch         TEXT DEFAULT '',
      program       TEXT DEFAULT '',
      photo_url     TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      contact       TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alumni (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      batch        TEXT DEFAULT '',
      program      TEXT DEFAULT '',
      status       TEXT DEFAULT 'Employed',
      company      TEXT DEFAULT '',
      job_title    TEXT DEFAULT '',
      contact      TEXT DEFAULT '',
      relevance    TEXT DEFAULT 'Not Related',
      time_to_first TEXT DEFAULT '',
      location     TEXT DEFAULT 'Local',
      student_id   TEXT DEFAULT '',
      last_updated TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS transcript_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      contact     TEXT DEFAULT '',
      date        TEXT DEFAULT '',
      purpose     TEXT DEFAULT '',
      status      TEXT DEFAULT 'Pending',
      type        TEXT DEFAULT '',
      delivery    TEXT DEFAULT '',
      payment_ref TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS reprints (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT DEFAULT '',
      type   TEXT DEFAULT '',
      status TEXT DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS placements (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      alumni  TEXT DEFAULT '',
      company TEXT DEFAULT '',
      title   TEXT DEFAULT '',
      date    TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT DEFAULT '',
      date       TEXT DEFAULT '',
      location   TEXT DEFAULT '',
      rsvps      INTEGER DEFAULT 0,
      registered INTEGER DEFAULT 0,
      status     TEXT DEFAULT 'Upcoming',
      attendees  TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS reunions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      batch        TEXT DEFAULT '',
      date         TEXT DEFAULT '',
      venue        TEXT DEFAULT '',
      coordinators TEXT DEFAULT '',
      confirmed    INTEGER DEFAULT 0,
      attendees    TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS donations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign TEXT DEFAULT '',
      donor    TEXT DEFAULT '',
      amount   REAL DEFAULT 0,
      date     TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS newsletters (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT DEFAULT '',
      body    TEXT DEFAULT '',
      sent_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT DEFAULT '',
      rating     INTEGER DEFAULT 5,
      category   TEXT DEFAULT '',
      message    TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      channel    TEXT DEFAULT '',
      recipient  TEXT DEFAULT '',
      subject    TEXT DEFAULT '',
      message    TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_records (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      alumni_id      INTEGER DEFAULT 0,
      program        TEXT DEFAULT '',
      year_graduated TEXT DEFAULT '',
      gwa            REAL DEFAULT 0,
      status         TEXT DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS job_opportunities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      company     TEXT DEFAULT '',
      location    TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status      TEXT DEFAULT 'Published',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        INTEGER DEFAULT 0,
      title         TEXT DEFAULT '',
      company       TEXT DEFAULT '',
      applicant     TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      resume_name   TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      body       TEXT DEFAULT '',
      status     TEXT DEFAULT 'Published',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id   INTEGER DEFAULT 0,
      actor_role TEXT DEFAULT '',
      action     TEXT DEFAULT '',
      entity     TEXT DEFAULT '',
      entity_id  TEXT DEFAULT '',
      detail     TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key   TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER DEFAULT 0,
      username   TEXT DEFAULT '',
      action     TEXT DEFAULT 'login',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  ensureColumn('users', 'status', "status TEXT DEFAULT 'Active'");
  ensureColumn('users', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('alumni', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('alumni', 'education_school', "education_school TEXT DEFAULT ''");
  ensureColumn('alumni', 'education_program', "education_program TEXT DEFAULT ''");
  ensureColumn('alumni', 'education_status', "education_status TEXT DEFAULT ''");
  ensureColumn('alumni', 'education_year', "education_year TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('transcript_requests', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('transcript_requests', 'remarks', "remarks TEXT DEFAULT ''");
  ensureColumn('reprints', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('reprints', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('reprints', 'remarks', "remarks TEXT DEFAULT ''");
  ensureColumn('placements', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('placements', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('donations', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('donations', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('feedback', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('feedback', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('job_applications', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('job_applications', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('notifications', 'user_id', 'user_id INTEGER DEFAULT 0');
  ensureColumn('notifications', 'alumni_id', 'alumni_id INTEGER DEFAULT 0');
  ensureColumn('notifications', 'related_type', "related_type TEXT DEFAULT ''");
  ensureColumn('notifications', 'related_id', "related_id TEXT DEFAULT ''");
  ensureColumn('notifications', 'is_read', 'is_read INTEGER DEFAULT 0');
  ensureColumn('notifications', 'read_at', "read_at TEXT DEFAULT ''");
  ensureColumn('notifications', 'notification_type', "notification_type TEXT DEFAULT ''");
  ensureColumn('notifications', 'target_url', "target_url TEXT DEFAULT ''");
  ensureColumn('notifications', 'email_status', "email_status TEXT DEFAULT ''");
  ensureColumn('notifications', 'sms_status', "sms_status TEXT DEFAULT ''");
  ensureColumn('users', 'address', "address TEXT DEFAULT ''");
  ensureColumn('alumni', 'email', "email TEXT DEFAULT ''");
  ensureColumn('alumni', 'address', "address TEXT DEFAULT ''");
  ensureColumn('announcements', 'audience', "audience TEXT DEFAULT 'alumni'");
  ensureColumn('transcript_requests', 'fee_centavos', 'fee_centavos INTEGER DEFAULT 0');
  ensureColumn('transcript_requests', 'payment_status', "payment_status TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'copies', 'copies INTEGER DEFAULT 1');
  ensureColumn('transcript_requests', 'claim_window', "claim_window TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'claim_notes', "claim_notes TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'approved_at', "approved_at TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'processed_at', "processed_at TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'released_at', "released_at TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'cancelled_at', "cancelled_at TEXT DEFAULT ''");
  ensureColumn('transcript_requests', 'correction_notes', "correction_notes TEXT DEFAULT ''");
  ensureColumn('reprints', 'fee_centavos', 'fee_centavos INTEGER DEFAULT 0');
  ensureColumn('reprints', 'payment_status', "payment_status TEXT DEFAULT ''");
  ensureColumn('reprints', 'copies', 'copies INTEGER DEFAULT 1');
  ensureColumn('reprints', 'claim_window', "claim_window TEXT DEFAULT ''");
  ensureColumn('reprints', 'claim_notes', "claim_notes TEXT DEFAULT ''");
  ensureColumn('reprints', 'approved_at', "approved_at TEXT DEFAULT ''");
  ensureColumn('reprints', 'processed_at', "processed_at TEXT DEFAULT ''");
  ensureColumn('reprints', 'released_at', "released_at TEXT DEFAULT ''");
  ensureColumn('reprints', 'cancelled_at', "cancelled_at TEXT DEFAULT ''");
  ensureColumn('reprints', 'correction_notes', "correction_notes TEXT DEFAULT ''");
  ensureColumn('payments', 'qr_image', "qr_image TEXT DEFAULT ''");
  ensureColumn('payments', 'qr_expires_at', "qr_expires_at TEXT DEFAULT ''");
  ensureColumn('payments', 'gateway_method_id', "gateway_method_id TEXT DEFAULT ''");
  ensureColumn('payments', 'request_code', "request_code TEXT DEFAULT ''");
  ensureColumn('payments', 'receipt_email_sent', 'receipt_email_sent INTEGER DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS request_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_type TEXT DEFAULT '',
      request_id   INTEGER DEFAULT 0,
      actor_id     INTEGER DEFAULT 0,
      actor_role   TEXT DEFAULT '',
      action       TEXT DEFAULT '',
      remarks      TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS request_attachments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_type TEXT NOT NULL,
      request_id   INTEGER NOT NULL,
      user_id      INTEGER DEFAULT 0,
      file_name    TEXT DEFAULT '',
      mime_type    TEXT DEFAULT '',
      size_bytes   INTEGER DEFAULT 0,
      data_uri     TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      title      TEXT DEFAULT 'Conversation',
      topic      TEXT DEFAULT '',
      language   TEXT DEFAULT 'en',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id         INTEGER DEFAULT 0,
      role            TEXT DEFAULT 'user',
      content         TEXT DEFAULT '',
      intent          TEXT DEFAULT '',
      topic           TEXT DEFAULT '',
      language        TEXT DEFAULT 'en',
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER DEFAULT 0,
      alumni_id          INTEGER DEFAULT 0,
      related_type       TEXT DEFAULT '',
      related_id         INTEGER DEFAULT 0,
      reference_id       TEXT DEFAULT '',
      gateway            TEXT DEFAULT 'paymongo',
      gateway_payment_id TEXT DEFAULT '',
      gateway_intent_id  TEXT DEFAULT '',
      gateway_checkout_id TEXT DEFAULT '',
      payment_method     TEXT DEFAULT 'gcash',
      amount_centavos    INTEGER DEFAULT 0,
      currency           TEXT DEFAULT 'PHP',
      status             TEXT DEFAULT 'pending',
      description        TEXT DEFAULT '',
      livemode           INTEGER DEFAULT 0,
      paid_at            TEXT DEFAULT '',
      failed_at          TEXT DEFAULT '',
      metadata           TEXT DEFAULT '{}',
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id   TEXT UNIQUE NOT NULL,
      payment_id INTEGER DEFAULT 0,
      event_type TEXT DEFAULT '',
      processed  INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments (gateway_checkout_id);
    CREATE INDEX IF NOT EXISTS idx_payments_gateway_payment ON payments (gateway_payment_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);

    CREATE TABLE IF NOT EXISTS mail_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER DEFAULT 0,
      user_id         INTEGER DEFAULT 0,
      recipient       TEXT DEFAULT '',
      subject         TEXT DEFAULT '',
      status          TEXT DEFAULT '',
      reason          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER DEFAULT 0,
      user_id         INTEGER DEFAULT 0,
      recipient       TEXT DEFAULT '',
      message         TEXT DEFAULT '',
      status          TEXT DEFAULT '',
      reason          TEXT DEFAULT '',
      provider_ref    TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);
  `);

  ensureSystemUsers();
  migrateRegistrarToStaff();
  clearLegacyDemoRecords();
  linkOrphanAlumniAccounts();
}

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

/* ------------------------------------------------------------------ *
 * Row mapper helpers (snake_case DB -> camelCase API)
 * ------------------------------------------------------------------ */
export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role === 'registrar' ? 'staff' : row.role,
    status: row.status || 'Active',
    name: row.name,
    title: row.title,
    avatar: row.avatar,
    studentId: row.student_id,
    alumniId: row.alumni_id || 0,
    batch: row.batch,
    program: row.program,
    photoUrl: row.photo_url,
    email: row.email,
    contact: row.contact,
    address: row.address || '',
    createdAt: row.created_at
  };
}

export function mapAlumni(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    batch: row.batch,
    program: row.program,
    status: row.status,
    company: row.company,
    title: row.job_title,
    contact: row.contact,
    email: row.email || '',
    address: row.address || '',
    relevance: row.relevance,
    timeToFirst: row.time_to_first,
    location: row.location,
    studentId: row.student_id,
    userId: row.user_id || 0,
    lastUpdated: row.last_updated,
    educationSchool: row.education_school || '',
    educationProgram: row.education_program || '',
    educationStatus: row.education_status || '',
    educationYear: row.education_year || ''
  };
}

/* ------------------------------------------------------------------ *
 * Sessions / auth helpers
 * ------------------------------------------------------------------ */
export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function findByToken(token) {
  const row = db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token);
  return mapUser(row);
}

export function writeAudit(user, action, entity, entityId, detail) {
  try {
    db.prepare(
      'INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      user?.id || 0,
      user?.role || '',
      action || '',
      entity || '',
      String(entityId || ''),
      detail || ''
    );
  } catch {
    /* audit must never break the request */
  }
}

/* ------------------------------------------------------------------ *
 * System users only. No fake alumni / events / requests are inserted.
 * ------------------------------------------------------------------ */
function ensureSystemUsers() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(
    `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertUser.run('admin', hash('admin123'), 'admin', 'Administrator', 'System Administrator', 'AD', 'SAA-ADMIN-01', '', 'Administration', '', 'admin@stagnes.edu.ph', '');
  insertUser.run('staff', hash('staff123'), 'staff', 'Staff Member', 'Staff', 'ST', 'SAA-STAFF-01', '', 'Operations', '', 'staff@stagnes.edu.ph', '');
  insertUser.run('registrar', hash('registrar123'), 'staff', 'Registrar Staff', 'Staff', 'RG', 'SAA-STAFF-02', '', 'Registrar', '', 'registrar@stagnes.edu.ph', '');
  insertUser.run('alumni', hash('alumni123'), 'alumni', 'Alumni User', 'Alumnus', 'AL', '', '', '', '', '', '');
  console.log('[db] Created system login accounts only. Module tables were left empty.');
}

function migrateRegistrarToStaff() {
  db.prepare("UPDATE users SET role = 'staff' WHERE role = 'registrar'").run();
  const staff = db.prepare("SELECT id FROM users WHERE LOWER(username) = 'staff'").get();
  if (!staff) {
    const hash = bcrypt.hashSync('staff123', 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact, status)
       VALUES (?, ?, 'staff', 'Staff Member', 'Staff', 'ST', 'SAA-STAFF-01', '', 'Operations', '', 'staff@stagnes.edu.ph', '', 'Active')`
    ).run('staff', hash);
    console.log('[db] Added staff login (staff / staff123).');
  }
  const registrar = db.prepare("SELECT id FROM users WHERE LOWER(username) = 'registrar'").get();
  if (!registrar) {
    const hash = bcrypt.hashSync('registrar123', 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact, status)
       VALUES (?, ?, 'staff', 'Registrar Staff', 'Staff', 'RG', 'SAA-STAFF-02', '', 'Registrar', '', 'registrar@stagnes.edu.ph', '', 'Active')`
    ).run('registrar', hash);
    console.log('[db] Restored registrar login (registrar / registrar123) with staff access.');
  }
}

export function findAlumniForUser(user) {
  if (!user || user.role === 'admin' || user.role === 'staff' || user.role === 'registrar') return null;
  if (user.alumniId) {
    const byId = db.prepare('SELECT * FROM alumni WHERE id = ?').get(Number(user.alumniId));
    if (byId) return byId;
  }
  const byUser = db.prepare('SELECT * FROM alumni WHERE user_id = ?').get(Number(user.id));
  if (byUser) return byUser;
  if (user.studentId) {
    const bySid = db.prepare('SELECT * FROM alumni WHERE student_id = ?').get(user.studentId);
    if (bySid) return bySid;
  }
  if (user.name) {
    const byName = db.prepare('SELECT * FROM alumni WHERE LOWER(name) = LOWER(?)').get(user.name);
    if (byName) return byName;
  }
  return null;
}

/** Ensure an alumni user has exactly one linked alumni demographic row. */
export function linkAlumniAccount(userOrId) {
  const userRow = typeof userOrId === 'object'
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(userOrId.id)
    : db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userOrId));
  if (!userRow || (userRow.role !== 'alumni')) return null;

  let alumni = findAlumniForUser(mapUser(userRow));
  if (!alumni) {
    const info = db.prepare(
      `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated, user_id)
       VALUES (?, ?, ?, 'Employed', '', '', ?, 'Not Related', '', 'Local', ?, ?, ?)`
    ).run(
      userRow.name,
      userRow.batch || '',
      userRow.program || '',
      userRow.contact || '',
      userRow.student_id || '',
      new Date().toISOString().split('T')[0],
      userRow.id
    );
    alumni = db.prepare('SELECT * FROM alumni WHERE id = ?').get(info.lastInsertRowid);
  }
  if (!alumni.user_id) {
    db.prepare('UPDATE alumni SET user_id = ? WHERE id = ?').run(userRow.id, alumni.id);
  }
  if (Number(userRow.alumni_id) !== Number(alumni.id)) {
    db.prepare('UPDATE users SET alumni_id = ? WHERE id = ?').run(alumni.id, userRow.id);
  }
  return db.prepare('SELECT * FROM alumni WHERE id = ?').get(alumni.id);
}

function linkOrphanAlumniAccounts() {
  const alumniUsers = db.prepare("SELECT * FROM users WHERE role = 'alumni'").all();
  for (const row of alumniUsers) {
    try { linkAlumniAccount(row); } catch { /* keep boot resilient */ }
  }
}

function targetUrlFor(relatedType, relatedId, paid) {
  const id = relatedId == null || relatedId === '' ? '' : String(relatedId);
  const type = String(relatedType || '').toLowerCase();
  if (type === 'transcript' || type === 'document') return id ? `/#/transcript-requests/${id}` : '/#/transcript-requests';
  if (type === 'reprint') return id ? `/#/certificate-requests/${id}` : '/#/certificate-requests';
  if (type === 'event') return id ? `/#/events/${id}` : '/#/events';
  if (type === 'job') return id ? `/#/jobs/${id}` : '/#/jobs';
  if (type === 'announcement') return id ? `/#/announcements/${id}` : '/#/announcements';
  if (type === 'survey' || type === 'feedback') return id ? `/#/surveys/${id}` : '/#/surveys';
  if (type === 'payment') return paid ? (id ? `/#/payment-receipt/${id}` : '/#/payments') : (id ? `/#/payment/${id}` : '/#/payments');
  if (type === 'application') return '/#/applications';
  if (type === 'system') return '/#/settings';
  return '/#/notifications';
}

export function notifyUser({
  userId, alumniId, recipient, channel, subject, message, relatedType, relatedId,
  notificationType, targetUrl, paid
}) {
  try {
    const type = notificationType || relatedType || channel || 'system';
    const url = targetUrl || targetUrlFor(relatedType, relatedId, paid);
    const info = db.prepare(
      `INSERT INTO notifications (
         channel, recipient, subject, message, user_id, alumni_id, related_type, related_id,
         is_read, notification_type, target_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      channel || 'SYSTEM',
      recipient || '',
      subject || '',
      message || '',
      userId || 0,
      alumniId || 0,
      relatedType || '',
      String(relatedId || ''),
      type,
      url
    );
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);
  } catch {
    return null;
  }
}

export function notifyAlumniAudience(subject, message, relatedType, relatedId, extras = {}) {
  const alumniUsers = db.prepare("SELECT * FROM users WHERE role = 'alumni' AND (status IS NULL OR status = 'Active')").all();
  for (const row of alumniUsers) {
    notifyUser({
      userId: row.id,
      alumniId: row.alumni_id || 0,
      recipient: row.email || row.name,
      channel: extras.channel || 'SYSTEM',
      subject,
      message,
      relatedType,
      relatedId,
      notificationType: extras.notificationType || relatedType
    });
  }
  return alumniUsers;
}

export function notifyStaffAudience(subject, message, relatedType, relatedId, extras = {}) {
  const staffUsers = db.prepare(
    "SELECT * FROM users WHERE role IN ('admin','staff','registrar') AND (status IS NULL OR status = 'Active')"
  ).all();
  for (const row of staffUsers) {
    notifyUser({
      userId: row.id,
      alumniId: 0,
      recipient: row.email || row.name,
      channel: extras.channel || 'SYSTEM',
      subject,
      message,
      relatedType,
      relatedId,
      notificationType: extras.notificationType || relatedType
    });
  }
  return staffUsers;
}

export function writeRequestHistory(user, requestType, requestId, action, remarks) {
  try {
    db.prepare(
      `INSERT INTO request_history (request_type, request_id, actor_id, actor_role, action, remarks)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(requestType, requestId, user?.id || 0, user?.role || '', action || '', remarks || '');
  } catch { /* history must never break the request */ }
}

export function writeLoginLog(user, action) {
  try {
    db.prepare('INSERT INTO login_logs (user_id, username, action) VALUES (?, ?, ?)').run(
      user?.id || 0, user?.username || '', action || 'login'
    );
  } catch { /* never block auth */ }
}

export function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
    key, typeof value === 'string' ? value : JSON.stringify(value)
  );
}

function clearLegacyDemoRecords() {
  if (String(process.env.KEEP_DEMO_DATA || '').toLowerCase() === 'true') return;
  const flag = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('demo_cleared');
  if (flag && flag.value === '1') return;

  const tables = [
    'alumni', 'transcript_requests', 'reprints', 'placements', 'events',
    'reunions', 'donations', 'newsletters', 'feedback', 'notifications',
    'academic_records', 'job_opportunities', 'job_applications', 'announcements'
  ];
  for (const table of tables) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run('demo_cleared', '1');
  console.log('[db] Removed previously seeded demo records. Tables are empty for real data entry.');
}