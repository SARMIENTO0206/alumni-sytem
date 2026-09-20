import { db, initDb } from '../src/db.js';
initDb();
db.prepare('DELETE FROM transcript_requests WHERE purpose = ? AND type = ?').run('Employment', 'Transcript of Records');
db.prepare("DELETE FROM request_history WHERE request_type = 'transcript' AND remarks = 'Employment'").run();
db.prepare("DELETE FROM notifications WHERE subject LIKE 'New job opportunity:%' OR subject LIKE 'Transcript request%' OR subject LIKE 'Transcript request %'").run();
db.prepare("DELETE FROM job_applications WHERE title = 'Connected Test Role'").run();
console.log('cleaned test rows');
