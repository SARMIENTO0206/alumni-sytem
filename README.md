# St. Agnes Academy of Caloocan — Alumni Management System

A full-stack Alumni Management System for St. Agnes Academy of Caloocan with a
**Node.js + Express + SQLite API backend** and a **modular JavaScript front-end**.

## ✨ What's inside

| Path                  | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `client/`             | **React front-end (Vite)** — the primary UI, matching the manuscript stack (React + CSS) |
| `index.html`          | Classic vanilla HTML/CSS/JS app — now served at `/classic` (kept as a fallback) |
| `style.css`           | Design system / brand styling for the classic app                           |
| `logo.jpeg`           | School logo asset                                                           |
| `js/`                 | Classic front-end logic, split into 8 modular JS files                      |
| `server/`             | **Node.js + Express + SQLite REST API** with **bcrypt** hashing + OpenAI API endpoints |
| `scripts/`            | Dev/test utilities (`test-frontends.ps1`, `test-render.ps1`, `test-api.ps1`, `extract-docx.ps1`) |

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

### Classic modules (`js/`, served at `/classic`)

`config`, `api`, `utils`, `auth`, `navigation`, `records`, `engagement`, `reports`.

## 🚀 Quick start

### 1. Backend (serves the API **and** both front-ends)

```bash
cd server
npm install
npm start          # => http://localhost:3000
```

### 2. Build the React front-end (once)

```bash
cd client
npm install
npm run build      # outputs client/dist, served by Express at /
```

Open **http://localhost:3000** → React front-end.
The classic app remains available at **http://localhost:3000/classic**.

### Optional: React dev server with hot reload

```bash
cd client
npm run dev        # => http://localhost:5173  (proxies /api to :3000)
```

> If `client/dist` is missing, the server automatically falls back to serving
> the classic app at `/` so the project always runs.

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
- **AI / OpenAI:** `POST /ai/assistant`, `POST /ai/compose-announcement`

Run the smoke tests to verify everything:

```bash
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1         # 39 API endpoints
powershell -ExecutionPolicy Bypass -File scripts/test-frontends.ps1   # / vs /classic routing
powershell -ExecutionPolicy Bypass -File scripts/test-render.ps1      # headless render (no JS errors)
```

## 🤖 OpenAI API — Automated Text Message Flows & AI Assistant

The **Agnesian AI Assistant** (chat window) and the newsletter composer's
**AI Compose** button talk to these endpoints. They call OpenAI's
`chat/completions` API when a key is configured, and otherwise fall back to a
built-in intelligent response engine that reads the live database.

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