import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './src/db.js';
import { requireAuth } from './src/auth.js';
import authRoutes from './src/routes/auth.js';
import alumniRoutes from './src/routes/alumni.js';
import documentsRoutes from './src/routes/documents.js';
import trackingRoutes from './src/routes/tracking.js';
import engagementRoutes from './src/routes/engagement.js';
import reportsRoutes from './src/routes/reports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));

/* Permissive CORS so the page can also talk to the API when opened directly
 * from disk (file://), e.g. for bcrypt login + notification logging. */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

initDb();

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'SAA Alumni Management System API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/alumni', requireAuth, alumniRoutes);
app.use('/api/tracking', requireAuth, trackingRoutes);
app.use('/api/reports', requireAuth, reportsRoutes);
app.use('/api', requireAuth, documentsRoutes);      // /transcripts, /reprints, /placements
app.use('/api', requireAuth, engagementRoutes);     // /events, /reunions, /donations, /newsletters, /feedback, /notifications

/* Serve the SPA (index.html + js/ + style.css + logo.jpeg). */
app.use(express.static(PROJECT_ROOT, { index: 'index.html' }));

app.use((err, req, res, next) => {
  console.error('[api] Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error.' });
});

app.listen(PORT, () => {
  console.log('  ');
  console.log('  St. Agnes Academy of Caloocan - Alumni Management System');
  console.log(`  API + Site running at  http://localhost:${PORT}`);
  console.log('  Demo accounts:  admin/admin123  alumni/alumni123  registrar/registrar123');
  console.log('  ');
});