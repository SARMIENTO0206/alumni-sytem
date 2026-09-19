# St. Agnes Academy of Caloocan — Alumni Management System

A full-stack Alumni Management System for St. Agnes Academy of Caloocan with a
**Node.js + Express + SQLite API backend** and a **modular JavaScript front-end**.

## ✨ What's inside

| Path                  | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `index.html`          | Main single-page application (home, login, dashboard, directory, events, QR-code verification) |
| `style.css`           | Custom design system / brand styling                                        |
| `logo.jpeg`           | School logo asset                                                           |
| `js/`                 | Front-end logic split into **8 modular JS files** (replaces the old 2,650-line monolith) |
| `server/`             | **Node.js + Express + SQLite REST API** (39 endpoints) with **bcrypt** password hashing + **OpenAI API** chat/compose endpoints |
| `scripts/`            | Dev utilities: `test-api.ps1` (API smoke test), `test-ai.ps1` / `test-ai-live.ps1` (AI endpoints), `split-modules.ps1` (refactor tool) |

### Front-end modules (`js/`)

| File           | Responsibility                                                    |
| -------------- | ----------------------------------------------------------------- |
| `config.js`    | Global state + seed data (loaded first)                           |
| `api.js`       | REST client (`SAA_API`): health probe, auth headers, error handling |
| `utils.js`     | Toast notifications, localStorage sync                            |
| `auth.js`      | Login/registration (bcrypt via API), roles, session handling      |
| `navigation.js`| View router, counters, digital ID, profile, page navigation       |
| `records.js`   | Alumni database, transcripts, reprints, placements, academic records |
| `engagement.js`| Events, reunions, donations, resume, notifications engine, newsletter, feedback, assistant chat |
| `reports.js`   | Graduate tracking, CHED tracer study, charts, registrar workflow, initialization |

## 🚀 Quick start

The backend serves the site **and** the API on the same port.

```bash
cd server
npm install
npm start          # => http://localhost:3000
```

Open **http://localhost:3000** in your browser.

### Demo accounts

| Role      | Username    | Password      |
| --------- | ----------- | ------------- |
| Admin     | `admin`     | `admin123`    |
| Alumni    | `alumni`    | `alumni123`   |
| Registrar | `registrar` | `registrar123`|

Passwords are verified server-side with **bcrypt** hashes. The demo credentials
above are only duplicated in `js/config.js` as an **offline fallback** (they are
never persisted to localStorage). If the API isn't running you can still explore
the UI in "demo mode" by opening `index.html` directly from disk.

## 🔌 API

Base URL: `http://localhost:3000/api` (bcrypt-hashed auth via `Authorization: Bearer <token>`)

- `GET  /api/health`
- **Auth:** `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `POST /auth/logout`
- **Alumni:** `GET /alumni`, `POST /alumni`, `GET /alumni/:id`, `PUT /alumni/:id`, `DELETE /alumni/:id`
- **Transcripts:** `GET /transcripts`, `POST /transcripts`, `PUT /transcripts/:id/status`
- **Reprints:** `GET /reprints`, `POST /reprints`, `PUT /reprints/:id/status`
- **Placements:** `GET /placements`, `POST /placements`
- **Tracking:** `GET /tracking`, `PUT /tracking/:id/employment`, `GET /tracking/stale-profiles`, `POST /tracking/reminders/sweep`
- **Engagement:** `GET/POST /events`, `POST /events/:id/rsvp`, `GET/POST /reunions`, `GET/POST /donations`, `GET/POST /newsletters`, `GET/POST /feedback`, `GET/POST /notifications`
- **Reports:** `GET /reports/summary`, `GET /reports/registrar`, `GET /reports/tracer-study`, `GET /reports/tracer-study/download`
- **AI / OpenAI:** `GET /ai/status`, `POST /ai/assistant`, `POST /ai/compose-announcement`, `POST /ai/gmail-auto-reply`, `POST /ai/summarize-survey`, `POST /ai/dashboard-insights`

Run the smoke test to verify everything:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

## 🤖 OpenAI API — Automated Text Message Flows & AI Assistant

The **Agnesian AI Assistant** (chat window), the newsletter **AI Compose** button,
and the **AI Assistant Tools** panel in *System Reports* call OpenAI's
`chat/completions` API when a key is configured. Without a key the system uses a
built-in fallback engine that reads the live database, so it always works.

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
> rule-based dashboard insights), so the UI keeps working for demos.

Verify the AI features:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-ai.ps1        # all 5 AI endpoints
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