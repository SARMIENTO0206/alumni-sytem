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
| Reports | CHED Graduate Tracer Study (CSV) |

> **The system runs fully without an OpenAI key.** AI features use the built-in
> fallback engine until `OPENAI_API_KEY` is configured.

## 📁 Project structure

| Path         | Description |
| ------------ | ----------- |
| `index.html` | The single-page application — home, login, role dashboards, directory, events, QR verification, AI assistant chat |
| `style.css`  | Design system / brand styling (maroon & gold, school typography) |
| `logo.jpeg`  | School logo |
| `js/`        | Front-end logic, split into 8 modules (see below) |
| `server/`    | Node.js + Express + SQLite REST API (**45 endpoints**), bcrypt hashing, OpenAI routes |
| `scripts/`   | Verification scripts: `test-api.ps1`, `test-ai.ps1`, `test-ai-live.ps1` |

### Front-end modules (`js/`)

| File            | Responsibility |
| --------------- | -------------- |
| `config.js`     | Global state (lists start empty; filled from the API) |
| `api.js`        | REST client (`SAA_API`): health probe, auth headers, error handling |
| `utils.js`      | Toast notifications, localStorage sync |
| `auth.js`       | Login/registration (bcrypt via API), roles, session handling |
| `navigation.js` | View router, counters, digital ID, profile, page navigation |
| `records.js`    | Alumni database, transcripts, reprints, placements, academic records |
| `engagement.js` | Events, reunions, donations, resume, notifications engine, newsletter, feedback, AI assistant chat |
| `reports.js`    | Graduate tracking, CHED tracer study, charts, registrar workflow, AI tools, initialization |

## 🧩 System modules

All ten modules from the project documentation are implemented, plus the
automated communication flows and AI features:

| # | Module | How to reach it |
| - | ------ | --------------- |
| 1 | Alumni Database | Admin → *Alumni Database* |
| 2 | Transcript Request Portal | Alumni submit; Registrar reviews and processes; Admin monitors |
| 3 | Graduate Tracking | *Graduate Tracking* (+ CHED Tracer Study export) |
| 4 | Job Placement Logs | *Job Placement Logs* / *Job Opportunities* |
| 5 | Alumni Event Registration | *Alumni Events* |
| 6 | Batch Reunions Manager | *Batch Reunions* |
| 7 | Donor Campaign Tool | *Donor Campaigns* |
| 8 | Certificate Reprint Request | Alumni submit; Registrar reviews and processes; Admin monitors |
| 9 | Alumni Newsletter | *Alumni Newsletter* (+ AI Compose) |
| 10 | Alumni Feedback & Survey | *Surveys & Feedback* |
| 11 | **AI Chat Support** (OpenAI) | Chat bubble (bottom-right) |
| + | **Automated SMS Notification Module** | Graduate Tracking → *Run SMS Reminder Sweep* |
| + | **Gmail Auto-Reply** (OpenAI) | Admin → *System Reports* → **AI Assistant Tools** |
| + | **AI Survey Summaries / Dashboard Insights** | Admin → *System Reports* → **AI Assistant Tools** |

### User roles

| Role | Access |
| ---- | ------ |
| **Administrator** | System oversight, reports, and document-request monitoring; does not submit or process alumni requests |
| **Registrar** | Alumni verification, document-request review and processing, release/claiming, request history, registrar reports |
| **Alumni** | Own profile, digital ID, transcript/certificate requests, job board, events, reunions, newsletter, surveys |

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

## Deploy on Render (so every device opens the same site)

This app is Node.js + SQLite. Use **Render**, not PHP cPanel. One web service
serves both the website and `/api`.

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in with GitHub.
2. **New** → **Blueprint** (or **Web Service**) → connect `SARMIENTO0206/alumni-sytem`.
3. If asked for commands, leave **Root Directory empty** (do not set it to `server`):
   - **Build:** `npm install --prefix server`
   - **Start:** `node server/index.js`
   - **Node version:** `22`
4. Set `APP_PUBLIC_URL` to the Render URL after the first deploy
   (example: `https://saa-alumni.onrender.com`).
5. Wait until the service is **Live**, then open that `https://….onrender.com` URL
   on any phone or laptop. Login should show **Live system · 20 Sep 2026 build**.
6. Custom domain: Render → the service → **Settings** → **Custom Domains** → add
   `alumni.yourschool.edu.ph` (or similar). At your domain DNS, add a **CNAME**
   to the Render hostname they show you.

On the free instance, SQLite can reset when the service sleeps or redeploys.
For a defense demo, keep the Render service awake and avoid frequent redeploys,
or attach a persistent disk to `server/data`.

## 🔌 API

Base URL: `http://localhost:3000/api`

All endpoints except `/health` and `/auth/login` / `/auth/register` require a
bearer token: `Authorization: Bearer <token>` (issued by `POST /auth/login`).

**45 endpoints total** — `ai(6)`, `alumni(5)`, `auth(4)`, `documents(8)`,
`engagement(13)`, `reports(4)`, `tracking(4)`, `health(1)`.

- `GET  /api/health` — service status + active AI engine
- **Auth (4):** `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `POST /auth/logout`
- **Alumni (5):** `GET /alumni`, `POST /alumni`, `GET /alumni/:id`, `PUT /alumni/:id`, `DELETE /alumni/:id`
- **Documents (8):** `GET/POST /transcripts`, `PUT /transcripts/:id/status`, `GET/POST /reprints`, `PUT /reprints/:id/status`, `GET/POST /placements`
- **Tracking (4):** `GET /tracking`, `PUT /tracking/:id/employment`, `GET /tracking/stale-profiles`, `POST /tracking/reminders/sweep`
- **Engagement (13):** `GET/POST /events`, `POST /events/:id/rsvp`, `GET/POST /reunions`, `GET/POST /donations`, `GET/POST /newsletters`, `GET/POST /feedback`, `GET/POST /notifications`
- **Reports (4):** `GET /reports/summary`, `GET /reports/registrar`, `GET /reports/tracer-study`, `GET /reports/tracer-study/download`
- **AI / OpenAI (6):** `GET /ai/status`, `POST /ai/assistant`, `POST /ai/compose-announcement`, `POST /ai/gmail-auto-reply`, `POST /ai/summarize-survey`, `POST /ai/dashboard-insights`

Role restrictions apply: `POST /alumni` and `DELETE /alumni/:id` are admin-only,
while `PUT /transcripts/:id/status` allows admin **and** registrar.

Run the smoke test to verify everything:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

## 🤖 OpenAI API — Automated Text Message Flows & AI Assistant

The **Agnesian AI Assistant** (chat bubble, bottom-right of every dashboard),
the newsletter **AI Compose** button, and the **AI Assistant Tools** panel in
*System Reports* (Administrator) call OpenAI's `chat/completions` API when a key
is configured. Without a key the system uses a built-in fallback engine that
reads the live database, so every feature still works.

**Where to find each AI feature in the UI:**

| Feature | Location |
| ------- | -------- |
| AI Chat Support | Chat bubble (bottom-right) — available to all roles |
| AI Compose (SMS / newsletter draft) | *Alumni Newsletter* → composer → **AI Compose** |
| Gmail Auto-Reply | *System Reports* → **AI Assistant Tools** → *Generate Auto-Reply* |
| Survey Response Summary | *System Reports* → **AI Assistant Tools** → *Summarize Survey Responses* |
| Dashboard Insights | *System Reports* → **AI Assistant Tools** → *Generate Dashboard Insights* |

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

## 📊 CHED Tracer Study compliance

The Graduate Tracking module includes a **CHED Graduate Tracer Study report**
(Commission on Higher Education of the Philippines). Use the
**"CHED Tracer Study (CSV)"** button in the track dashboard, or:

```
GET /api/reports/tracer-study/download
```

Both the API and the UI produce a CHED-standardised CSV (graduate outcomes,
employment status, field-of-study relevance, time-to-first-job, location, etc.).

## License

All rights reserved.