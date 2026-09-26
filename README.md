# St. Agnes Academy of Caloocan — Alumni Management System

A web-based Alumni Management System with automated text-message flows and
OpenAI API integration.

**Latest shared copy:** https://github.com/SARMIENTO0206/alumni-sytem (ignore
`SoloLevelings/nicose-sarmiento` — outdated). There is no demo mode; other
devices must clone this repo and run `npm start` in `server/`.

| Layer | Technology |
| ----- | ---------- |
| Front-end | HTML5 + Tailwind CSS (CDN) + modular JavaScript (`js/`) |
| Back-end | Node.js + Express (REST API) |
| Database | SQLite via Node's built-in `node:sqlite` |
| Auth | bcrypt password hashing + bearer session tokens |
| AI | OpenAI API (`gpt-4o-mini`) with a built-in fallback engine (works without a key) |
| Reports | JHS/SHS graduate outcome analytics and CSV exports |

## 📁 Project structure

| Path | Description |
| ---- | ----------- |
| `index.html` | Single-page app — home, login, role dashboards, directory, events, QR verification, AI chat |
| `style.css`, `logo.jpeg` | Brand styling and school logo |
| `js/` | Front-end modules: `config`, `api`, `utils`, `auth`, `navigation`, `access` (roles/dashboards/announcements), `records`, `engagement`, `reports` |
| `server/` | Node.js + Express + SQLite REST API, bcrypt hashing, OpenAI routes |
| `scripts/` | Verification scripts: `test-api.ps1`, `test-ai.ps1`, `test-ai-live.ps1` |

## 📊 Role-based dashboards

Same visual design for every role (KPI cards → announcements/attention panel
→ role-specific work area), different content per role:

| Section | Admin | Registrar | Alumni |
| ------- | ----- | --------- | ------ |
| KPIs | Total Alumni, Pending Requests, Employed Alumni, Upcoming Events | Pending Requests, For Processing, Completed Requests, Records to Verify | My Requests, Upcoming Events, Job Opportunities, Profile Completion |
| Attention panel | System issues & tasks | Processing tasks (clickable) | Personal reminders (profile, graduate status, corrections) |
| Growth chart | ✅ | ❌ | ❌ |
| Work area | Analytics + system-wide activity feed | Request Queue table + registrar activity | Quick Services (Request Transcript/Certificate, Update Graduate Status, Browse Jobs) |

**Targeted announcements:** composers pick a Target Audience — `All Users`,
`Alumni Only`, `Specific Batch` (shows a batch picker), or `Admin & Registrar`.
Admin sees everything; Registrar sees `All Users`/`Admin & Registrar`; Alumni
see `All Users`/`Alumni Only`/their own matching `Specific Batch`.

## 🧩 System modules & roles

| # | Module | How to reach it |
| - | ------ | --------------- |
| 1 | Alumni Database | Registrar creates/edits/verifies; Admin has export/archive oversight |
| 2 | Transcript Requests | Alumni submit → Registrar processes → Admin monitors |
| 3 | Graduate Tracking | Alumni update own status; Registrar verifies; Admin analytics/exports |
| 4 | Career Management | Alumni report employment; Admin/Registrar manage job opportunities |
| 5 | Alumni Events / 6 Batch Reunions / 7 Donor Campaigns | Self-service under their own menus |
| 8 | Certificate Reprints | Same flow as transcript requests |
| 9 | Alumni Newsletter | Registrar drafts → Admin approves/publishes → Alumni read |
| 10 | Feedback & Surveys | *Surveys & Feedback* |
| 11 | Communications | Admin/Registrar send announcements/SMS/email via Message Center; Notifications inbox is the header bell |
| 12 | AI Chat Support | Chat bubble, bottom-right, all roles |
| + | Profile Reminders, Gmail Auto-Reply, AI Survey/Dashboard Insights | Admin → *AI Services* → **AI Assistant Tools** |

**Roles:** **Admin** — full oversight, analytics, user/access management, AI
integrations; does not submit/process requests. **Registrar** — alumni
records, request review/processing, announcements, SMS/email, reports.
**Alumni** — own profile/status, digital ID, requests, jobs, events, surveys.

Key business rules: alumni records are archived (never deleted); new manual
records stay **Pending Verification** until the Registrar verifies them;
document requests are free (no checkout); newsletters go through a
Registrar-draft → Admin-publish flow with in-app/email/SMS delivery;
announcements/newsletters support scheduling, expiration, and channel
selection; graduate tracking covers JHS/SHS outcomes without treating missing
data as unemployment, and only Alumni can update their own status.

## 🛠️ Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | Upgrade Node.js to ≥ 22.5 |
| `EADDRINUSE :::3000` | Stop the old server, or `Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` |
| Login says *"Invalid username or password"* | Run `npm start` in `server/` first — don't open `index.html` from disk |
| AI panel shows *"Built-in AI fallback"* | Expected without a key — see the OpenAI section below |
| Need a different port | `set PORT=4000` then `npm start` |
| Reset all data | Stop the server, delete `server/data/saa.db`, restart |

## 🚀 Quick start

Requires Node.js **≥ 22.5** (built-in `node:sqlite`).

```bash
cd server
npm install
npm start          # => http://localhost:3000
```

Open **http://localhost:3000** — first run creates `server/data/saa.db` with
system accounts only (no sample alumni data):

| Role | Username | Password |
| ---- | -------- | -------- |
| Admin | `admin` | `admin123` |
| Alumni | `alumni` | `alumni123` |
| Registrar | `registrar` | `registrar123` |

## 🚢 Deploy (Railway — live site)

The production copy runs on **[Railway](https://railway.app)**, which
auto-redeploys on every push to `main` on `SARMIENTO0206/alumni-sytem`.

- Root directory empty; Railway detects `server/package.json`.
- **Start command:** `node server/index.js` · **Node:** 22+
- Set in Railway → **Variables**: `APP_PUBLIC_URL` (Railway domain),
  `OPENAI_API_KEY` (optional), and SMTP variables (below) for OTP emails.
- Every push redeploys automatically — verify with `GET /api/health`.
- SQLite resets if the service sleeps/redeploys without a volume; attach a
  Railway volume to `server/data` for persistence. (Render also works with
  the same `node server/index.js` start command.)

### 📧 Email / OTP delivery

Forgot-password OTP emails need SMTP variables set in Railway, otherwise
`/api/health` reports *"SMTP is not configured"*:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your16digitapppassword
SMTP_FROM=yourgmail@gmail.com
```

For Gmail: enable **2-Step Verification**, generate a **Google App Password**
(never your real password), add the variables above, then redeploy/restart.
Check `GET /api/health` for `mail.configured: true`. If OTP still fails, check
the Railway logs for `535 Authentication failed` / `Invalid login` right
after clicking **Send OTP** — that points to the Gmail credentials.

## 🔌 API

Base URL: `/api` (bearer token from `POST /auth/login` required on all routes
except `/health` and `/auth/login|register`).

- **Auth / Alumni / Documents:** login, registration, profile, and
  role-restricted record + transcript/reprint/placement endpoints
- **Tracking:** `GET /tracking`, `GET/PUT /tracking/settings`,
  `PUT /tracking/:id/employment`, `PUT /tracking/:id/review`,
  `POST /tracking/reminders/sweep`
- **Engagement:** events, reunions, donations, newsletters, feedback, jobs, announcements
- **Reports / AI:** operational + Registrar reports; assistant, announcement composition, survey summaries, dashboard insights

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

## 🤖 OpenAI API — AI Assistant

The chat bubble (all roles), newsletter **AI Compose**, and Admin's **AI
Assistant Tools** panel call OpenAI's `chat/completions` when a key is set;
otherwise a built-in fallback answers from the live database.

| Endpoint | Purpose |
| -------- | ------- |
| `GET /api/ai/status` | Active engine (OpenAI vs fallback) |
| `POST /api/ai/assistant` | AI Chat Support |
| `POST /api/ai/compose-announcement` | AI-generated SMS/newsletter copy |
| `POST /api/ai/gmail-auto-reply` | Drafted reply for inbound email |
| `POST /api/ai/summarize-survey` | Survey sentiment/themes/recommendations |
| `POST /api/ai/dashboard-insights` | Narrative insight from live metrics |

Enable OpenAI:

```bash
copy server\.env.example server\.env      # Windows (or cp on Linux/macOS)
```

```ini
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini        # optional
```

Restart the server; the startup banner confirms the active engine.
`server/.env` is gitignored — the key is never committed or sent to the
frontend.

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-ai.ps1        # all AI endpoints
powershell -ExecutionPolicy Bypass -File scripts/test-ai-live.ps1   # proves the real OpenAI path
```

## 📊 Graduate Tracking validation

Run the role, profile-integrity, status, review, and reminder-setting
integration checks while the API is running:

```bash
cd server
npm run test:tracking
```

## License

All rights reserved.