import './src/load-env.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDb } from './src/db.js';
import { requireAuth } from './src/auth.js';
import { isAiConfigured, aiModel } from './src/ai.js';
import { getSupabaseConfig, pingSupabase } from './src/supabase.js';
import authRoutes from './src/routes/auth.js';
import alumniRoutes from './src/routes/alumni.js';
import documentsRoutes from './src/routes/documents.js';
import trackingRoutes from './src/routes/tracking.js';
import engagementRoutes from './src/routes/engagement.js';
import reportsRoutes from './src/routes/reports.js';
import aiRoutes from './src/routes/ai.js';
import usersRoutes from './src/routes/users.js';
import settingsRoutes from './src/routes/settings.js';
import paymentsRoutes, { handlePaymongoWebhook } from './src/routes/payments.js';
import notificationRoutes from './src/routes/notifications.js';
import publicRoutes from './src/routes/public.js';
import { paymongoConfig } from './src/paymongo.js';
import { mailAndSmsHealth } from './src/notify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveProjectRoot() {
  const candidates = [
    join(__dirname, '..'),
    process.cwd(),
    join(process.cwd(), '..')
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'js'))) return dir;
  }
  return join(__dirname, '..');
}

const PROJECT_ROOT = resolveProjectRoot();
const PORT = Number(process.env.PORT) || 3000;
const APP_BUILD = '2026-09-26-communications';

const app = express();
/* PayMongo webhook must read the raw body for HMAC verification. */
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  Promise.resolve(handlePaymongoWebhook(req, res)).catch(next);
});
app.use(express.json({ limit: '2mb' }));

/* Permissive CORS for local development; restrict in production with CORS_ORIGINS. */
app.use((req, res, next) => {
  const raw = String(process.env.CORS_ORIGINS || '*').trim();
  const origin = req.headers.origin;
  if (raw === '*') {
    res.set('Access-Control-Allow-Origin', '*');
  } else {
    const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

initDb();

const supabaseConfig = getSupabaseConfig();
let supabaseStatus = {
  configured: supabaseConfig.configured,
  urlConfigured: supabaseConfig.urlConfigured,
  keyConfigured: supabaseConfig.keyConfigured,
  authReachable: false,
  postgresConnected: false,
  message: supabaseConfig.keyConfigured
    ? 'Checking Supabase connection...'
    : 'Add SUPABASE_ANON_KEY to server/.env (anon public key only, not service_role).'
};

function refreshSupabaseStatus() {
  pingSupabase().then((supabase) => {
    supabaseStatus = {
      configured: supabase.configured,
      urlConfigured: supabase.urlConfigured,
      keyConfigured: supabase.keyConfigured,
      authReachable: supabase.auth.ok,
      postgresConnected: supabase.postgres.ok,
      message: supabase.message
    };
  }).catch(() => {
    supabaseStatus = {
      ...supabaseStatus,
      authReachable: false,
      postgresConnected: false,
      message: 'Could not reach the Supabase project URL.'
    };
  });
}

refreshSupabaseStatus();

app.get('/api/public/stats', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    alumni: count('SELECT COUNT(*) AS n FROM alumni'),
    events: count('SELECT COUNT(*) AS n FROM events'),
    jobs: count("SELECT COUNT(*) AS n FROM job_opportunities WHERE status = 'Published'")
  });
});

app.get('/api/health', (req, res) => {
  let sqliteOk = false;
  try {
    sqliteOk = db.prepare('SELECT 1 AS ok').get()?.ok === 1;
  } catch {
    sqliteOk = false;
  }

  res.json({
    ok: sqliteOk,
    service: 'SAA Alumni Management System API',
    build: APP_BUILD,
    demoData: false,
    time: new Date().toISOString(),
    ai: { configured: isAiConfigured(), model: isAiConfigured() ? aiModel() : null },
    sqlite: { connected: sqliteOk },
    supabase: supabaseStatus,
    payments: {
      gateway: 'paymongo',
      configured: paymongoConfig().configured,
      mode: paymongoConfig().mode
    },
    ...mailAndSmsHealth()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/alumni', requireAuth, alumniRoutes);
app.use('/api/tracking', requireAuth, trackingRoutes);
app.use('/api/reports', requireAuth, reportsRoutes);
app.use('/api/ai', requireAuth, aiRoutes);          // assistant, compose, gmail-auto-reply, summaries, insights
app.use('/api/users', requireAuth, usersRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/payments', requireAuth, paymentsRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api', requireAuth, documentsRoutes);      // /transcripts, /reprints, /placements
app.use('/api', requireAuth, engagementRoutes);     // /events, /reunions, /donations, /newsletters, /feedback

/* Serve the SPA (index.html + js/ + style.css + logo.jpeg). */
app.use(express.static(PROJECT_ROOT, { index: 'index.html' }));

app.get('/', (req, res) => {
  const indexFile = join(PROJECT_ROOT, 'index.html');
  if (!existsSync(indexFile)) {
    return res.status(500).type('html').send(
      '<h1>Site files not found</h1><p>On Render, leave Root Directory empty (repository root). Build: <code>npm install --prefix server</code>. Start: <code>node server/index.js</code>.</p>'
    );
  }
  res.sendFile(indexFile);
});

app.use((err, req, res, next) => {
  console.error('[api] Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('  ');
  console.log('  St. Agnes Academy of Caloocan - Alumni Management System');
  console.log(`  Build:          ${APP_BUILD} (no demo records)`);
  console.log(`  API + Site:     http://localhost:${PORT}`);
  console.log(`  Site files:     ${PROJECT_ROOT}`);
  console.log('  Shared copy:    https://github.com/SARMIENTO0206/alumni-sytem');
  const payments = paymongoConfig();
  console.log(
    isAiConfigured()
      ? `  AI engine:      OpenAI API (model: ${aiModel()})`
      : '  AI engine:      Built-in fallback (add OPENAI_API_KEY to server/.env for OpenAI)'
  );
  console.log(
    payments.configured
      ? `  Payments:       PayMongo (${payments.mode})`
      : '  Payments:       PayMongo not configured (add PAYMONGO_SECRET_KEY to server/.env)'
  );
  console.log(`  Supabase:       ${supabaseStatus.message}`);
  console.log('  ');
});