/**
 * server/scripts/seed.js - database initializer / seeder.
 *
 * Usage:
 *   npm run seed              create the schema and seed demo data on a fresh DB
 *   npm run seed -- --reset   delete the existing database first, then re-seed
 *
 * The application also seeds itself automatically on first start (see
 * initDb() -> seedIfEmpty() in ../src/db.js), so this script is a convenience
 * for resetting demo data without deleting files by hand.
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbFile = join(__dirname, '..', 'data', 'saa.db');
const reset = process.argv.includes('--reset');

if (reset) {
  /* WAL mode keeps -wal/-shm sidecar files next to the database. */
  for (const suffix of ['', '-wal', '-shm']) {
    const target = dbFile + suffix;
    if (existsSync(target)) {
      rmSync(target);
      console.log(`[seed] removed ${target}`);
    }
  }
}

/* Imported dynamically so a --reset happens before node:sqlite opens the file. */
const { initDb, db } = await import('../src/db.js');
initDb();

const TABLES = [
  'users', 'alumni', 'transcript_requests', 'reprints', 'placements', 'events',
  'reunions', 'donations', 'newsletters', 'feedback', 'notifications',
  'academic_records', 'job_postings', 'job_applications', 'message_replies'
];

console.log(`[seed] database ready: ${dbFile}`);
for (const table of TABLES) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log(`  ${table.padEnd(20)} ${n} row(s)`);
}
console.log('[seed] demo logins: admin/admin123  alumni/alumni123  registrar/registrar123');