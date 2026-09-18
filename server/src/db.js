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
  `);

  seedIfEmpty();
}

/* ------------------------------------------------------------------ *
 * Row mapper helpers (snake_case DB -> camelCase API)
 * ------------------------------------------------------------------ */
export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name,
    title: row.title,
    avatar: row.avatar,
    studentId: row.student_id,
    batch: row.batch,
    program: row.program,
    photoUrl: row.photo_url,
    email: row.email,
    contact: row.contact,
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
    relevance: row.relevance,
    timeToFirst: row.time_to_first,
    location: row.location,
    studentId: row.student_id,
    lastUpdated: row.last_updated
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

/* ------------------------------------------------------------------ *
 * Seed data (runs once on a fresh database)
 * ------------------------------------------------------------------ */
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(
    `INSERT INTO users (username, password_hash, role, name, title, avatar, student_id, batch, program, photo_url, email, contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertUser.run('admin', hash('admin123'), 'admin', 'Administrator', 'System Administrator', 'AD', 'SAA-ADMIN-01', '2015', 'Administration', '', 'admin@stagnes.edu.ph', '(02) 8361-2345');
  insertUser.run('alumni', hash('alumni123'), 'alumni', 'Maria Clara Santos', 'Alumna (Batch 2024)', 'MS', 'SAA-2024-0089', '2024', 'BS Information Technology', '', 'maria.santos@example.com', '+63 917 123 4567');
  insertUser.run('registrar', hash('registrar123'), 'registrar', 'Registrar Office', 'School Registrar', 'RO', 'SAA-REG-01', '2010', 'Registrar Records', '', 'registrar@stagnes.edu.ph', '(02) 8288-1234');

  const insertAlumni = db.prepare(
    `INSERT INTO alumni (name, batch, program, status, company, job_title, contact, relevance, time_to_first, location, student_id, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const demoAlumni = [
    ['Maria Clara D. Santos', '2024', 'BS Information Technology', 'Employed', 'TechSolutions Inc.', 'Software Engineer', '+63 917 123 4567', 'Directly Related', '< 1 Month', 'Local', 'SAA-2024-0089', '2026-08-20'],
    ['Juan Miguel R. Reyes', '2018', 'BS Business Administration', 'Employed', 'Global Finance Ltd.', 'Financial Analyst', '+63 918 987 6543', 'Directly Related', '1-3 Months', 'Local', 'SAA-2018-0412', '2025-02-10'],
    ['Angela K. Mendoza', '2020', 'BS Computer Science', 'Employed', 'Ayala Land Inc.', 'Data Analyst', '+63 922 456 7890', 'Directly Related', '< 1 Month', 'Local', 'SAA-2020-0931', '2024-11-05'],
    ['Joseph P. Aquino', '2021', 'BS Education', 'Unemployed', '', '', '+63 919 234 5678', 'Not Related', '> 1 Year', 'Local', 'SAA-2021-0155', '2026-07-30'],
    ['Isabella C. De Leon', '2015', 'BS Nursing', 'Freelance', 'CarePlus Services', 'Consultant', '+63 927 345 6789', 'Directly Related', '3-6 Months', 'Local', 'SAA-2015-0819', '2026-08-01'],
    ['Christian Gabriel Perez', '2023', 'BS Accountancy', 'Employed', 'KPMG Philippines', 'Junior Auditor', '+63 939 456 7891', 'Directly Related', '< 1 Month', 'Local', 'SAA-2023-0188', '2026-08-25']
  ];
  for (const a of demoAlumni) insertAlumni.run(...a);

  const insertTranscript = db.prepare(
    'INSERT INTO transcript_requests (name, email, contact, date, purpose, status, type, delivery, payment_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertTranscript.run('Juan Miguel R. Reyes', 'juan.reyes@example.com', '+63 918 987 6543', '2024-05-10', 'Employment', 'Pending', 'Transcript of Records', 'Pick-up at Registrar Window', 'N/A');
  insertTranscript.run('Joseph P. Aquino', 'joseph.aquino@example.com', '+63 919 234 5678', '2024-05-09', 'Graduate Studies', 'Approved', 'Transcript of Records', 'Pick-up at Registrar Window', 'N/A');
  insertTranscript.run('Isabella C. De Leon', 'isabella.deleon@example.com', '+63 927 345 6789', '2024-05-08', 'PRC Board Exam', 'Rejected', 'Certificate of Graduation', 'Pick-up at Registrar Window', 'N/A');
  insertTranscript.run('Maria Clara D. Santos', 'maria.santos@example.com', '+63 917 123 4567', '2024-05-14', 'Passport / Visa', 'Released', 'Transcript of Records', 'Pick-up at Registrar Window', 'N/A');

  const insertReprint = db.prepare('INSERT INTO reprints (name, type, status) VALUES (?, ?, ?)');
  insertReprint.run('Maria Clara D. Santos', 'Official Diploma Copy', 'Pending');
  insertReprint.run('Angela K. Mendoza', 'Certificate of Graduation', 'Approved');

  const insertPlacement = db.prepare('INSERT INTO placements (alumni, company, title, date) VALUES (?, ?, ?, ?)');
  insertPlacement.run('Maria Clara D. Santos', 'TechSolutions Inc.', 'Software Engineer', '2024-05-12');
  insertPlacement.run('Angela K. Mendoza', 'FinanceHub Global', 'Data Analyst', '2024-05-11');
  insertPlacement.run('Christian Gabriel Perez', 'KPMG Philippines', 'Junior Auditor', '2024-05-03');

  const insertEvent = db.prepare(
    'INSERT INTO events (title, date, location, rsvps, registered, status, attendees) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertEvent.run('Agnesian Grand Homecoming 2024', 'June 15, 2024 • 9:00 AM', 'SAA Main Grounds', 58, 0, 'Upcoming', '[]');
  insertEvent.run('Batch 2014 Decennial Reunion', 'July 20, 2024 • 6:00 PM', 'SAA Multi-purpose Hall', 34, 0, 'Upcoming', '[]');
  insertEvent.run('Alumni Career Leadership Summit', 'August 10, 2024 • 1:00 PM', 'SAA Auditorium', 22, 0, 'Upcoming', '[]');

  const insertReunion = db.prepare(
    "INSERT INTO reunions (batch, date, venue, coordinators, confirmed, attendees) VALUES (?, ?, ?, ?, 0, '[]')"
  );
  insertReunion.run('Batch 2014 (10th Year)', 'July 20, 2024', 'SAA Multi-purpose Hall', 'Clarissa Santos (+63 917 123 4567)');
  insertReunion.run('Batch 2019 (5th Year)', 'October 12, 2024', 'Grand Ballroom Manila', 'Kenji Lopez (+63 920 987 6543)');

  const insertDonation = db.prepare('INSERT INTO donations (campaign, donor, amount, date) VALUES (?, ?, ?, ?)');
  insertDonation.run('Alumni Scholarship Fund 2024', 'Anonymous', 25000, '2024-05-15');
  insertDonation.run('Class of 1999 Endowment', 'Batch 1999 Reunion Committee', 100000, '2024-04-02');

  const insertNewsletter = db.prepare('INSERT INTO newsletters (subject, body, sent_at) VALUES (?, ?, ?)');
  insertNewsletter.run('May 2024 Alumni Newsletter', 'Highlighting the Agnesian Grand Homecoming, batch reunions and the alumni career summit. Read the full edition on our portal.', '2024-05-01');
  insertNewsletter.run('April 2024 Alumni Newsletter', 'A look back at the donor success stories and profile freshness campaign for graduate tracking.', '2024-04-01');

  const insertFeedback = db.prepare('INSERT INTO feedback (name, rating, category, message) VALUES (?, ?, ?, ?)');
  insertFeedback.run('Maria Clara D. Santos', 5, 'Systems', 'The online transcript request was seamless. Great feature for overseas alumni!');
  insertFeedback.run('Juan Miguel R. Reyes', 4, 'Events', 'Homecoming registration was easy but the QR scanning at the entrance could be faster.');

  const insertAcademic = db.prepare(
    'INSERT INTO academic_records (alumni_id, program, year_graduated, gwa, status) VALUES (?, ?, ?, ?, ?)'
  );
  insertAcademic.run(1, 'BS Information Technology', '2024', 1.85, 'Active');
  insertAcademic.run(2, 'BS Business Administration', '2018', 1.55, 'Active');
  insertAcademic.run(3, 'BS Computer Science', '2020', 1.9, 'Graduated');
  insertAcademic.run(4, 'BS Education', '2021', 2.1, 'Active');
  insertAcademic.run(5, 'BS Nursing', '2015', 1.75, 'Graduated');
  insertAcademic.run(6, 'BS Accountancy', '2023', 1.6, 'Active');

  console.log('[db] Seeded fresh database with demo users, alumni, requests and campaigns.');
}