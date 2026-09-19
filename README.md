# St. Agnes Academy of Caloocan — Alumni Management System

A full-stack Alumni Management System for St. Agnes Academy of Caloocan:
a **React front-end** (`client/`) and a **Node.js + Express + SQLite REST API** (`server/`).

## ✨ What's inside

| Path       | Description |
| ---------- | ----------- |
| `client/`  | **React front-end (Vite + hand-written CSS)** — the application UI |
| `server/`  | **Node.js + Express + SQLite REST API** — 41 endpoints, bcrypt hashing, OpenAI API routes |
| `scripts/` | Verification scripts (`test-api.ps1`, `test-render.ps1`) |

## 🧩 Technology stack (per project manuscript)

| Layer      | Manuscript (`DOCU-CHAPT-1-3`, `B.1 Project Charter`) | Implemented as |
| ---------- | ---------------------------------------------------- | -------------- |
| Frontend   | **React + CSS**                                       | `client/` (React 19 + Vite + hand-written CSS) |
| Backend    | **Node.js** (RESTful APIs)                            | `server/` (Express 5) |
| Database   | Supabase / **PostgreSQL**                             | SQLite (`node:sqlite`) — same REST surface; swap-in ready* |
| Auth       | Supabase Auth                                         | **bcrypt** + bearer-token sessions |
| AI / comms | OpenAI API, Gmail, SMS                                | `POST /api/ai/assistant`, `/api/ai/compose-announcement`, notification log |

\* The manuscripts target Supabase/PostgreSQL. The API layer is written so the
storage engine can be swapped; the current runnable build uses the embedded
SQLite driver so the project runs with **zero external services**.

### Front-end modules

| File                              | Responsibility |
| --------------------------------- | -------------- |
| `client/src/App.jsx`              | Auth gate + view switching |
| `client/src/api.js`               | REST client, session handling, domain APIs |
| `client/src/styles.css`           | Brand design system |
| `client/src/components/Layout.jsx`| Role-based sidebar/navigation shell |
| `client/src/pages/Login.jsx`      | bcrypt-backed sign-in |
| `client/src/pages/Dashboard.jsx`  | Live roll-up stats from the API |
| `client/src/pages/AlumniDatabase.jsx` | Alumni CRUD (admin) / read-only for registrar |
| `client/src/pages/Transcripts.jsx`| Request filing + registrar approval workflow |
| `client/src/pages/Tracking.jsx`   | Graduate tracking KPIs, employment updates, CHED export |
| `client/src/pages/Events.jsx`     | Events + RSVP |

**UI coverage:** the React interface currently implements Login, Dashboard,
Alumni Database, Transcript Requests, Graduate Tracking (with the CHED export)
and Events. The remaining REST endpoints below (reprints, reunions, donations,
newsletters, feedback, notifications, AI assistant/compose, registrar reporting)
are API-only until their React views are added.

## 🚀 Quick start

### 1. Install & build the React front-end

```bash
cd client
npm install
npm run build      # outputs client/dist, served by Express at /
```

### 2. Start the server (serves the API **and** the built UI)

```bash
cd server
npm install
npm start          # => http://localhost:3000
```

Open **http://localhost:3000** in your browser.

### Optional: React dev server with hot reload

```bash
cd client
npm run dev        # => http://localhost:5173  (proxies /api to :3000)
```

> If `client/dist` is missing the server responds with a reminder to run the
> build; the API at `/api/*` works regardless.

### Demo accounts

| Role      | Username    | Password      |
| --------- | ----------- | ------------- |
| Admin     | `admin`     | `admin123`    |
| Alumni    | `alumni`    | `alumni123`   |
| Registrar | `registrar` | `registrar123`|

Passwords are stored and verified **server-side as bcrypt hashes**; credentials
are seeded into the database on first run and are never persisted in the client.

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
- **AI / OpenAI:** `POST /ai/assistant`, `POST /ai/compose-announcement`

Run the verification scripts:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1      # all 41 API endpoints
powershell -ExecutionPolicy Bypass -File scripts/test-render.ps1   # headless render of the React UI
```

## 🤖 OpenAI API — Automated Text Message Flows & AI Assistant

The AI endpoints implement the automated text-message / announcement flow: they
call OpenAI's `chat/completions` API when a key is configured, and otherwise fall
back to a built-in response engine that reads the live database.

- `POST /api/ai/assistant` — natural-language queries (`{ "query": "..." }`)
- `POST /api/ai/compose-announcement` — drafts SMS/newsletter copy (`{ "topic": "...", "channel": "SMS|Newsletter" }`)

### Set up your OpenAI key

```bash
# Option 1: environment variable
set OPENAI_API_KEY=sk-...          # Windows (PowerShell / cmd)
export OPENAI_API_KEY=sk-...       # Linux / macOS

# Option 2: pass the key via Node's --env-file
# server/.env  ->  OPENAI_API_KEY=sk-...
node --env-file=.env server/index.js
```

> No key? The endpoints still respond using the **built-in fallback** (which
> quotes live alumni counts, pending transcript requests, and events), so the
> UI keeps working for demos and offline review.

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