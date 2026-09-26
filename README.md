# St. Agnes Academy Alumni Management System

Web-based alumni management system for St. Agnes Academy of Caloocan.

- **Repository:** https://github.com/SoloLevelings/nicose-sarmiento
- **Live site:** https://saa-alumni-production.up.railway.app
- **Backend:** Node.js, Express, SQLite
- **AI:** OpenAI optional; built-in fallback works without an API key

## Run locally

Requirements: **Node.js 22.5 or newer**.

```powershell
cd "C:\path\to\alumni system"
npm install --prefix server
cd server
npm start
```

Open http://localhost:3000. Do not open `index.html` directly.

Check the API:

```text
http://localhost:3000/api/health
```

### Default accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| Alumni | `alumni` | `alumni123` |
| Registrar | `registrar` | `registrar123` |

## Document request roles

- **Alumni** submit transcript, academic-record, and certificate-reprint requests and track their status.
- **Registrar** reviews requests, asks for corrections, approves or rejects them, and manages processing and release.
- **Administrator** monitors request status but cannot submit or process requests on an alumnus's behalf.
- Document requests start in **Pending** and do not require online payment.
- The Payments page and document-request checkout are removed; Alumni donation checkout remains available in Donation Campaigns.

## Deploy on Railway

Railway is connected to the `main` branch and uses the repository Dockerfile.

1. Create a Railway project from the GitHub repository.
2. Leave **Root Directory** empty.
3. Use the Dockerfile. The service start command must be:
   ```text
   node index.js
   ```
4. Generate a public domain under **Settings → Networking**.
5. Add these variables:
   ```text
   NODE_ENV=production
   CORS_ORIGINS=*
   APP_PUBLIC_URL=https://saa-alumni-production.up.railway.app
   ```
6. Add a Railway Volume mounted at:
   ```text
   /app/server/data
   ```
   This preserves the SQLite database between deployments.
7. Verify:
   ```text
   https://saa-alumni-production.up.railway.app/api/health
   ```
   It should return `"ok":true` and `"sqlite":{"connected":true}`.

### Custom domain

The custom domain `smsstagnesacademy.com` is attached in Railway. Add these
records at your domain registrar:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `@` | `spioh2w7.up.railway.app` |
| TXT | `_railway-verify` | `railway-verify=98b6f1667769438bd3330a020cbd60b700590026c114763cbde60f222ac492e5` |

Do not add `http://` or `https://` to DNS values. After DNS propagation,
Railway will enable HTTPS automatically.

## Automatic deployments

Push changes to the connected `main` branch:

```powershell
git add .
git commit -m "Describe the change"
git push origin main
```

Railway then builds, deploys, and checks `/api/health`. Local changes are not
deployed until they are pushed to GitHub.

## Optional OpenAI setup

```powershell
copy server\.env.example server\.env
notepad server\.env
```

Set:

```ini
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

Restart the server. Without a key, the built-in AI fallback remains available.

## Tests and troubleshooting

Run the API smoke test from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-api.ps1
```

Common fixes:

| Problem | Fix |
| --- | --- |
| `node:sqlite` not found | Install Node.js 22.5+ and redeploy using the Dockerfile |
| Port 3000 is busy | Stop the previous Node process or set another `PORT` |
| API offline | Start the backend and use `http://localhost:3000` |
| Railway health check fails | Confirm start command is `node index.js` and target port is Railway’s `PORT` |
| Custom domain pending | Add the CNAME and TXT records above and wait for DNS propagation |

Optional services such as OpenAI, Supabase, PayMongo, SMTP, and SMS are not
required for the core system.
