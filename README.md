# St. Agnes Academy of Caloocan — Alumni Management System

A web-based Alumni Management System for St. Agnes Academy of Caloocan Inc. with
automated text-message flows and OpenAI API integration.

**Latest shared copy:** https://github.com/SARMIENTO0206/alumni-sytem  
Do not use `SoloLevelings/nicose-sarmiento` — that repository is outdated and still
contains the old demo seed. There is no demo mode. Other devices must clone this
repo, delete any old `server/data/saa.db`, then run `npm start` in `server/`.

| Layer | Technology |
| ----- | ---------- |
| Front-end | HTML5 + Tailwind CSS (CDN) + modular JavaScript (`js/`) |
| Back-end | Node.js + Express (REST API) |
| Database | SQLite via Node's built-in `node:sqlite` |
| Auth | bcrypt password hashing + bearer session tokens |
| AI | OpenAI API (`gpt-4o-mini`) with a built-in fallback engine |
| Reports | JHS/SHS graduate outcome analytics and CSV exports |

> **The system runs fully without an OpenAI key.** AI features use the built-in
> fallback engine until `OPENAI_API_KEY` is configured.

## 📁 Project structure

| Path         | Description |
| ------------ | ----------- |
| `index.html` | The single-page application — home, login, role dashboards, directory, events, QR verification, AI assistant chat |
| `style.css`  | Design system / brand styling (maroon & gold, school typography) |
| `logo.jpeg`  | School logo |
| `js/`        | Front-end logic, split into 9 modules (see below) |
| `server/`    | Node.js + Express + SQLite REST API, bcrypt hashing, OpenAI routes |
| `scripts/`   | Verification scripts: `test-api.ps1`, `test-ai.ps1`, `test-ai-live.ps1` |

### Front-end modules (`js/`)

| File            | Responsibility |
| --------------- | -------------- |
| `config.js`     | Global state (lists start empty; filled from the API) |
| `api.js`        | REST client (`SAA_API`): health probe, auth headers, error handling |
| `utils.js`      | Toast notifications, localStorage sync |
| `auth.js`       | Login/registration (bcrypt via API), roles, session handling |
| `navigation.js` | View router, counters, digital ID, profile, page navigation |
| `access.js`     | Role helpers, permissions, role-based dashboards, targeted announcements |
| `records.js`    | Alumni database, transcripts, reprints, employment records, academic records |
| `engagement.js` | Events, reunions, donations, resume, notifications engine, newsletter, feedback, AI assistant chat |
| `reports.js`    | Graduate tracking, outcome charts, Registrar review, AI tool initialization |

## 📊 Role-based dashboards

Each role sees the same visual design (KPI cards → announcements/attention
panel → role-specific work area) but with different content so the dashboard
matches what that role actually does:

| Section | Admin | Registrar | Alumni |
| ------- | ----- | --------- | ------ |
| KPI 1 | Total Alumni | Pending Requests | My Requests |
| KPI 2 | Pending Requests | For Processing | Upcoming Events |
| KPI 3 | Employed Alumni | Completed Requests | Job Opportunities |
| KPI 4 | Upcoming Events | Records to Verify | Profile Completion |
| Announcements | ✅ | ✅ | ✅ |
| Requires Attention / Reminders | System issues & tasks | Processing tasks (clickable) | Personal reminders (profile, graduate status, corrections) |
| Growth chart | ✅ Alumni Community Growth | ❌ | ❌ |
| Recent Activities | System-wide | Registrar actions | — (replaced by Quick Services) |
| Work area | Analytics + system-wide activity feed | Request Queue table | Quick Services (Request Transcript/Certificate, Update Graduate Status, Browse Jobs) |

### Targeted announcements

When Admin or Registrar composes an announcement, they choose a **Target
Audience**: `All Users`, `Alumni Only`, `Specific Batch`, or `Admin & Registrar`.
Choosing **Specific Batch** reveals a batch picker populated from real alumni
batch years. The system then only notifies and displays the announcement to
the matching audience:

- **Admin** always sees every announcement (oversight view).
- **Registrar/Staff** sees `All Users` and `Admin & Registrar` announcements.
- **Alumni** sees `All Users`, `Alumni Only`, and `Specific Batch` announcements
  that match their own batch year.

## 🧩 System modules

All ten modules from the project documentation are implemented, plus the
automated communication flows and AI features:

| # | Module | How to reach it |
| - | ------ | --------------- |
| 1 | Alumni Database | Registrar → *Alumni Database* to create/edit/verify; Admin → view/export/archive oversight |
| 2 | Transcript Request Portal | Alumni submit; Registrar reviews and processes; Admin monitors |
| 3 | Graduate Tracking | Admin analytics/exports; Registrar record review; Alumni update their own status |
| 4 | Career Management | Alumni report employment through Graduate Tracking; Admin/Registrar review shared records and manage job opportunities |
| 5 | Alumni Event Registration | *Alumni Events* |
| 6 | Batch Reunions Manager | *Batch Reunions* |
| 7 | Donor Campaign Tool | *Donor Campaigns* |
| 8 | Certificate Reprint Request | Alumni submit; Registrar reviews and processes; Admin monitors |
| 9 | Alumni Newsletter | Registrar drafts and submits; Admin reviews and publishes; Alumni read published editions |
| 10 | Alumni Feedback & Survey | *Surveys & Feedback* |
| 11 | **Communications** | Admin/Registrar manage announcements and manual SMS/email from Communications → Message Center; each user's Notifications inbox is opened from the header bell |
| 12 | **AI Chat Support** (OpenAI) | Chat bubble (bottom-right) |
| + | **Profile Update Reminders** | Admin configures the reminder period and confirms each send from Graduate Tracking |
| + | **Gmail Auto-Reply** (OpenAI) | Admin → *AI Services* → **AI Assistant Tools** |
| + | **AI Survey Summaries / Dashboard Insights** | Admin → *AI Services* → **AI Assistant Tools** |

### User roles

| Role | Access |
| ---- | ------ |
| **Administrator** | System oversight, graduate outcome analytics, reports/exports, user/access management, AI integrations, communications oversight, and reminder-period configuration; does not submit or process alumni requests |
| **Registrar** | Alumni records, graduate-status review, document-request review and processing, release/claiming, announcements, manual SMS/email, request history, registrar reports |
| **Alumni** | Own profile and graduate status, digital ID, transcript/certificate requests, job board, announcements, notifications, events, reunions, newsletter, surveys |

Profiles are opened from the header name or avatar. Alumni can edit their contact details, while name and academic records are read-only and verified by the Registrar; career details are updated through **My Graduate Status**. Admin and Registrar profiles contain staff account information only. All roles change passwords under **Settings → Security**; Settings does not duplicate the profile editor.

Alumni records are never permanently deleted from the Alumni Database. Registrar is responsible for creating, editing, and verifying school information; new manual records remain **Pending Verification** and do not create or activate an account. Admin has oversight access to view, search, export, archive, and restore records; archiving keeps related history and deactivates a linked account. Account invitations are a separate later workflow.

Document requests are free and no longer use online checkout. The Payments history page is removed for all roles. Alumni donation checkout remains available in Donation Campaigns.

Newsletters are general to all Alumni. Registrar staff can save drafts, edit their own drafts, and submit them for approval; Admin can approve and publish or return a draft with an editing note. In-app, email, and short SMS notifications are sent to the selected active Alumni audience only when Admin publishes. Newsletter delivery counts are recorded for staff review.

Communications keeps content and alerts separate: announcements can be saved as drafts, published immediately, or scheduled with an optional expiration date and selected in-app/email/SMS channels; Notifications is the signed-in user's inbox for system-generated alerts, reachable from the header bell. Admin and Registrar can send SMS or email through the nested **Message Center** menu and review delivery history. Manual email supports an optional PDF attachment up to 1 MB; broadcast sends are limited to 500 recipients.

Graduate tracking is designed for JHS and SHS alumni. It reports employed, self-employed, seeking-employment, further-study/training, not-currently-seeking, and no-status-data outcomes without treating missing information as unemployment. SHS pathways are shown separately from JHS records, and strand filters are available only for SHS. Industry charts use alumni-reported categories; the Registrar verifies submitted tracking records, while only Alumni can update their own status. Reminder timing is configurable by Admin, and every reminder send requires confirmation.

## 🛠️ Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | Node is older than 22.5 — upgrade Node.js |
| `EADDRINUSE: address already in use :::3000` | A previous server is still running. Stop it, or run:<br>`Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` |
| `SQLite is an experimental feature` (warning) | Harmless Node notice for `node:sqlite` — the system runs normally |
| Login says *"Invalid username or password"* | Start `npm start` in `server/`, then use a registered account. Do not open `index.html` from disk. |
| AI panel shows *"Built-in AI fallback"* | Expected without a key — see the OpenAI section to enable the API |
| AI panel shows *"API server offline"* | Start the backend (`cd server; npm start`) before using the AI tools |
| Need a different port | `set PORT=4000` (Windows) or `export PORT=4000`, then `npm start` |
| Reset all data | Stop the server, delete `server/data/saa.db`, start again (system logins only; module tables stay empty) |

## 🚀 Quick start

**Requirements:** Node.js **≥ 22.5** — the API uses the built-in `node:sqlite`
module (developed and tested on Node 24).

Check your version:

```bash
node --version
```

The backend serves the site **and** the API on the same port:

```bash
cd server
npm install
npm start          # => http://localhost:3000
```

Open **http://localhost:3000** in the browser. Do **not** open `index.html` from
disk — there is no offline demo mode.

> First run creates `server/data/saa.db` with **system login accounts only**.
> Alumni, requests, events, and jobs start empty. On another device that still
> shows old demo records, delete `server/data/saa.db` and start the server again.

### First-run logins (not sample alumni data)

| Role      | Username    | Password      |
| --------- | ----------- | ------------- |
| Admin     | `admin`     | `admin123`    |
| Alumni    | `alumni`    | `alumni123`   |
| Registrar | `registrar` | `registrar123`|

Passwords are verified server-side with **bcrypt**. Clone
**https://github.com/SARMIENTO0206/alumni-sytem** (not `SoloLevelings/nicose-sarmiento`).

## Deploy (Railway — currently used for the live site)

This app is Node.js + SQLite. The production copy is deployed on
**[Railway](https://railway.app)**, which auto-redeploys on every push to
`main` on `SARMIENTO0206/alumni-sytem`.

1. Open the Railway project dashboard and confirm the service is linked to
   `SARMIENTO0206/alumni-sytem` (branch `main`).
2. Root directory can stay empty; Railway detects `server/package.json`.
   - **Start command:** `node server/index.js` (already set in `server/package.json`)
   - **Node version:** 22+ (uses built-in `node:sqlite`)
3. Set environment variables in Railway → the service → **Variables**:
   - `APP_PUBLIC_URL` — the Railway-provided domain (e.g. `https://saa-alumni-production.up.railway.app`)
   - `OPENAI_API_KEY` (optional) — enables real OpenAI responses instead of the fallback engine
   - SMTP variables (see **Email / OTP delivery** below) — required for password-reset OTP emails to actually send
4. Every `git push` to `main` triggers a new Railway deploy automatically —
   no manual redeploy step is needed.
5. Check `GET /api/health` on the live URL after a push to confirm the new
   build is serving (the `build` field changes when the API restarts).

> Render also works if you prefer it (Node.js + SQLite, same `npm install --prefix server`
> build command and `node server/index.js` start command) — Railway is simply
> what this project currently runs on.

On a free/sleeping instance, SQLite can reset when the service sleeps or
redeploys. For persistence, attach a Railway volume to `server/data`.

### 📧 Email / OTP delivery (forgot-password codes)

The **Email** health status (and the Forgot Password OTP flow) shows
*"SMTP is not configured"* until these variables are set on Railway:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your16digitapppassword
SMTP_FROM=yourgmail@gmail.com
```

For Gmail specifically:

1. Enable **2-Step Verification** on the sending Gmail account.
2. Generate a **Google App Password** (Google Account → Security → App
   Passwords) — never put your normal Gmail password here.
3. Add the variables above in Railway → **Variables**, then redeploy/restart
   the service so the running backend picks up the new SMTP config.
4. Check `GET /api/health` — the `mail.configured` field should become `true`.
5. If OTP emails still fail, check the Railway service logs right after
   clicking **Send OTP** for errors like `535 Authentication failed` or
   `Invalid login`, which point to the Gmail credentials rather than the code.

## 🔌 API

Base URL: `http://localhost:3000/api`

All endpoints except `/health` and `/auth/login` / `/auth/register` require a
bearer token: `Authorization: Bearer <token>` (issued by `POST /auth/login`).

Routes are grouped by authentication, alumni records, document requests,
engagement, reports, graduate tracking, settings, notifications, and AI tools.

- `GET /api/health` — service status + active AI engine
- **Auth:** login, registration, profile, password, and session endpoints
- **Alumni:** role-restricted record search and management
- **Documents:** transcript, reprint, and placement requests
- **Tracking:** `GET /tracking`, `GET/PUT /tracking/settings`,
  `PUT /tracking/:id/employment`, `PUT /tracking/:id/review`,
  `GET /tracking/stale-profiles`, and `POST /tracking/reminders/sweep`
- **Engagement:** events, reunions, donations, newsletters, feedback, jobs, and announcements
- **Reports:** operational, dashboard, and Registrar reports
- **AI / OpenAI:** assistant, announcement composition, survey summaries, and dashboard insights

Administrative and Registrar actions are protected by role-based authorization.

Run the smoke test to verify everything:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

## 🤖 OpenAI API — Automated Text Message Flows & AI Assistant

The **Agnesian AI Assistant** (chat bubble, bottom-right of every dashboard),
the newsletter **AI Compose** button, and the **AI Assistant Tools** panel in
*AI Services* (Administrator) call OpenAI's `chat/completions` API when a key
is configured. Without a key the system uses a built-in fallback engine that
reads the live database, so every feature still works.

**Where to find each AI feature in the UI:**

| Feature | Location |
| ------- | -------- |
| AI Chat Support | Chat bubble (bottom-right) — available to all roles |
| AI Compose (SMS / newsletter draft) | *Alumni Newsletter* → composer → **AI Compose** |
| Gmail Auto-Reply | *AI Services* → **AI Assistant Tools** → *Generate Auto-Reply* |
| Survey Response Summary | *AI Services* → **AI Assistant Tools** → *Summarize Survey Responses* |
| Dashboard Insights | *AI Services* → **AI Assistant Tools** → *Generate Dashboard Insights* |

The panel header shows a badge indicating which engine is active
(*OpenAI API* or *Built-in AI fallback*).

| Endpoint | Purpose |
| -------- | ------- |
| `GET  /api/ai/status` | Reports which engine is active (OpenAI vs fallback) |
| `POST /api/ai/assistant` | AI Chat Support — natural-language queries |
| `POST /api/ai/compose-announcement` | AI-generated SMS / newsletter copy |
| `POST /api/ai/gmail-auto-reply` | Gmail Auto-Reply — inbound email → OpenAI → drafted reply (logged to the notification centre) |
| `POST /api/ai/summarize-survey` | Summarizes collected survey responses into sentiment, themes and recommendations |
| `POST /api/ai/dashboard-insights` | Narrative insight from live metrics (employment, tracer freshness, requests, engagement) |

### Set up your OpenAI key (2 steps)

```bash
# 1. Create the config file from the template
copy server\.env.example server\.env      # Windows
cp   server/.env.example server/.env      # Linux / macOS
```

```ini
# 2. Edit server/.env and paste your key
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini        # optional
OPENAI_TIMEOUT_MS=20000         # optional
```

Then restart the server. The startup banner confirms which engine is active:

```
  AI engine:      OpenAI API (model: gpt-4o-mini)
```

> **Security:** `server/.env` is **gitignored** — the key is never committed nor
> sent to the frontend. This satisfies the manuscript's requirement that API
> credentials must not be exposed in publicly accessible source code.
>
> **No key?** Every AI endpoint still responds using the built-in fallback
> (live alumni counts, pending requests, events, computed survey statistics and
> rule-based dashboard insights) from the real database.

Verify the AI features:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-ai.ps1        # all 6 AI endpoints
powershell -ExecutionPolicy Bypass -File scripts/test-ai-live.ps1   # proves the real OpenAI path is called
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