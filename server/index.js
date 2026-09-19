import express from 'express';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb } from './src/db.js';
import { requireAuth } from './src/auth.js';
import { isAiConfigured, aiModel } from './src/ai.js';
import { rateLimit } from './src/rate-limit.js';
import authRoutes from './src/routes/auth.js';
import alumniRoutes from './src/routes/alumni.js';
import documentsRoutes from './src/routes/documents.js';
import trackingRoutes from './src/routes/tracking.js';
import engagementRoutes from './src/routes/engagement.js';
import reportsRoutes from './src/routes/reports.js';
import aiRoutes from './src/routes/ai.js';
import jobsRoutes from './src/routes/jobs.js';
import messagesRoutes from './src/routes/messages.js';
import flowRoutes from './src/routes/flow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

/* Load server/.env using Node's built-in loader (no extra dependency).
 * server/.env.example is the template; .env itself is gitignored so the
 * OpenAI credential is never committed nor exposed to the frontend. */
const envFile = join(__dirname, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    console.warn(`  Could not read server/.env: ${err.message}`);
  }
}

const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please try again later.'
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || (origin === 'null' && process.env.NODE_ENV !== 'production'))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

initDb();

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'SAA Alumni Management System API',
    time: new Date().toISOString(),
    ai: { configured: isAiConfigured(), model: isAiConfigured() ? aiModel() : null }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/alumni', requireAuth, alumniRoutes);
app.use('/api/tracking', requireAuth, trackingRoutes);
app.use('/api/reports', requireAuth, reportsRoutes);
app.use('/api/ai', requireAuth, aiRoutes);          // assistant, compose, gmail-auto-reply, summaries, insights
app.use('/api', requireAuth, flowRoutes);           // legacy inbound message replies
app.use('/api', requireAuth, documentsRoutes);      // /transcripts, /reprints, /placements
app.use('/api', requireAuth, engagementRoutes);     // /events, /reunions, /donations, /newsletters, /feedback, /notifications
app.use('/api', requireAuth, jobsRoutes);            // /jobs, /applications
app.use('/api', requireAuth, messagesRoutes);        // demo outbound messages and inbound replies

/* Serve ONLY the SPA front-end assets (index.html + js/ + style.css + logo.jpeg).
 * NOTE: never serve the whole PROJECT_ROOT - that would expose the backend source
 * (server/src/*.js), the SQLite database (server/data/saa.db, which stores the
 * bcrypt password hashes) and the verification scripts over plain HTTP. */
const FRONTEND_FILES = ['index.html', 'style.css', 'logo.jpeg'];
for (const file of FRONTEND_FILES) {
  app.get(`/${file}`, (req, res) => res.sendFile(join(PROJECT_ROOT, file)));
}
app.use('/js', express.static(join(PROJECT_ROOT, 'js'), { dotfiles: 'deny' }));
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[api] Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error.' });
});

app.listen(PORT, () => {
  console.log('  ');
  console.log('  St. Agnes Academy of Caloocan - Alumni Management System');
  console.log(`  API + Site running at  http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('  Demo accounts:  admin/admin123  alumni/alumni123  registrar/registrar123');
  }
  console.log(
    isAiConfigured()
      ? `  AI engine:      OpenAI API (model: ${aiModel()})`
      : '  AI engine:      Built-in fallback (add OPENAI_API_KEY to server/.env for OpenAI)'
  );
  console.log('  ');
});