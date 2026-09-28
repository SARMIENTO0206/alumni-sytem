# St. Agnes Academy of Caloocan — Alumni Management System

A web-based Alumni Management System with automated text-message flows and
OpenAI API integration.

**Latest shared copy:** <https://github.com/SARMIENTO0206/alumni-sytem> (ignore
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

Every role shares the exact same dashboard layout — welcome banner → 4
role-based summary cards → Announcements (Featured announcement + grid of
other announcements). Only the data shown in the cards differs per role; the
detailed analytics, request queues, and activity feeds that used to live on
the dashboard now live in their respective modules (Graduate Tracking /
Reports, Transcript Requests, Events, etc.), reachable from the sidebar.

| Section | Admin | Registrar | Alumni |
| ------- | ----- | --------- | ------ |
| Summary cards | Total Alumni, Pending Requests, Employed Alumni, Upcoming Events | Pending Requests, For Processing, Completed Requests, Records to Verify | My Requests, Request Status, Job Opportunities, Upcoming Events |
| Announcements | Featured + other announcements (role-filtered) | Featured + other announcements (role-filtered) | Featured + other announcements (role-filtered) |
| Growth chart | Available under Graduate Tracking / Reports | ❌ | ❌ |

**Targeted announcements:** composers pick a Target Audience — `All Users`,
`Alumni Only`, `Specific Batch` (shows a batch picker), or `Admin & Registrar`.
Admin sees everything; Registrar sees `All Users`/`Admin & Registrar`; Alumni
see `All Users`/`Alumni Only`/their own matching `Specific Batch`. An optional
photo (JPG/PNG/WebP, up to 1 MB) can be attached and is shown on the
Featured/Others cards and the full Announcements page.

## 🧭 Sidebar navigation

The sidebar is grouped by workflow: click a group header to collapse or expand
it. Single-item groups are flattened into plain links, so nothing is hidden
behind a menu with only one entry. Profile and the notifications inbox live in
the header, not the sidebar.

- **Admin (*Modules*)** — Dashboard · Alumni Database · Document Services ·
  Career & Tracking · Alumni Engagement · Communications ·
  Reports & Administration
- **Registrar (*Registrar Operations*)** — Dashboard · Alumni Database ·
  Document Services · Career & Tracking · Alumni Engagement · Communications ·
  Reports
- **Alumni (*Alumni Portal*)** — Dashboard · My Graduate Status ·
  Document Requests · Career Management · Alumni Engagement · Announcements ·
  Settings

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
| 10 | Feedback & Surveys | *Surveys & Feedback* — Alumni submit → Registrar processes → Admin monitors (Feedback Overview) |
| 11 | Communications | Admin/Registrar send announcements/SMS/email under the *Communications* group; the Notifications inbox is the header bell |
| 12 | AI Chat Support | Chat bubble, bottom-right, all roles; role-aware responses |
| + | AI features (embedded in their workflows, no standalone "AI Tools" page) | **Summarize Feedback** in Admin's Feedback & Survey Analytics; **Generate Insights** in Admin's System Reports; **Generate Message** in the SMS composer; **AI Draft Reply to Inquiry** in the Email composer; **AI Compose** in the Newsletter composer |

**Roles:** **Admin** — full oversight, analytics, user/access management (sidebar
→ Reports & Administration → User & Access Management), AI integrations; does not
submit/process requests. **Registrar** — alumni
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

Open <http://localhost:3000> — first run creates `server/data/saa.db` with
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
- **Announcements:** `GET/POST /announcements`, `GET /announcements/:id`,
  `GET /announcements/:id/deliveries` (per-channel delivery report; Admin/Staff)
- **Event reminders (automated SMS flow):** `GET /events/reminders` (schedule,
  stages, delivery log) and `POST /events/reminders/run` (dispatch due stages now)
- **Reports / AI:** operational + Registrar reports; assistant, announcement composition, survey summaries, dashboard insights

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

## 📣 Announcements, delivery reports & the automated SMS flow

**One announcement, many channels.** Admin (or the Registrar) writes the
announcement once — title, message, optional banner photo, target audience
(*All Users / Alumni Only / Specific Batch / Admin & Registrar*), publish
timing (now or scheduled), expiry and the channels to use — then the system
distributes it:

```text
Create Announcement → Publish
        ↓
announcements table (single source of truth)
        ↓
   ┌────┴─────┬──────────┐
 PORTAL     EMAIL       SMS
 (always)  (optional) (optional)
   ↓          ↓          ↓
Dashboard  Registered  Registered
           email       mobile number
```

- **Portal** ("Publish to Alumni Portal") is the default channel; Email and SMS
  are optional so an announcement never costs SMS credits unless selected.
- Publishing stores the record, then dispatches the selected channels and links
  every recipient to the announcement through the notification log.
- **Delivery Report** on each published announcement shows Portal (published /
  read), Email (sent / failed / not attempted / service unavailable) and SMS per
  channel, plus the per-recipient table with the provider reason for failures.
  The report is a read model over `notifications`, `mail_logs` and `sms_logs`, so
  it always matches the real delivery history — nothing is double-written.
- "Sent" always means the email/SMS provider **accepted** the message. With no
  provider configured the status stays honest (`not_configured`) instead of
  pretending the message went out.
- **AI draft:** the Create Announcement form has **Draft with AI**
  (`POST /api/ai/compose-announcement`, OpenAI when `OPENAI_API_KEY` is set,
  built-in fallback otherwise). The draft fills the title and message fields and
  is always reviewed by the Admin before publishing.

### ⏰ Event-triggered reminder flow (T-3 / T-1)

Once an event exists, the server runs the "event is approaching" leg of the
automated text message flow — no manual send required:

```text
Admin creates Alumni Event
        ↓
Announcement (portal + email) goes out immediately
        ↓
3 days before the event → portal notification + SMS
1 day before the event  → portal notification + SMS
```

- Stages are configurable: `EVENT_REMINDER_DAYS_BEFORE=3,1` (comma-separated
  days before the event; default `3,1`).
- Recipients are the alumni who registered for the event. SMS is attempted only
  when a provider is configured (`SEMAPHORE_API_KEY` or the Twilio trio), and
  the phone number comes from the alumni profile.
- Every dispatched stage is recorded in the `event_reminders` table, so a stage
  is **never sent twice**, even across server restarts (the server also checks
  for due stages at boot).
- Admin/Staff can review the schedule, the sent stages and the delivery log, or
  force a due-stage dispatch, with **Send Due Reminders** on the Events page
  (`GET /api/events/reminders`, `POST /api/events/reminders/run`).
  Pass `{ "catchUp": true }` to `run` to deliberately recover stages the server
  was offline for.

## 🤖 OpenAI API — AI Assistant

The chat bubble (all roles), newsletter **AI Compose**, and Admin's **AI
Assistant Tools** panel call OpenAI's `chat/completions` when a key is set;
otherwise a built-in fallback answers from the live database.

| Endpoint | Purpose |
| -------- | ------- |
| `GET /api/ai/status` | Active engine (OpenAI vs fallback) |
| `POST /api/ai/assistant` | AI Chat Support |
| `POST /api/ai/compose-announcement` | AI-drafted announcement / newsletter / SMS copy (used by the announcement composer, Newsletter AI Compose and the SMS composer) |
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
