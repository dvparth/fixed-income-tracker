# Fixed Income Tracker

YieldFlow is a mobile-first full-stack app for tracking fixed deposits, SCSS positions, bond-style instruments, maturity rollovers, and interest-led reinvestment flows.

It is designed around one practical problem: fixed-income investments do not live independently. Maturity proceeds and periodic interest receipts often become the funding source for new investments, and this app helps track that lineage cleanly.

## Highlights

- Track bank FDs, SCSS, bonds, and similar fixed-income instruments
- Capture maturity proceeds and periodic interest receipts as reusable cash sources
- Link new investments back to maturity or interest funding
- View reinvestment usage and remaining allocable cash
- Mobile-first navigation for overview, deposits, and add/edit workflows
- Express + MongoDB backend

## Tech Stack

- React 19
- Vite
- Express 5
- MongoDB + Mongoose
- Plain CSS with mobile-first responsive behavior

## Project Structure

```text
src/
  App.jsx
  App.css
  features/
    deposits/
      depositModel.js
      DepositsView.jsx
    editor/
      DepositEditorView.jsx

server/
  index.js

shared/
  masterData.js
```

## Local Setup

1. Install dependencies:

```powershell
npm.cmd install
```

2. Copy environment variables:

```powershell
Copy-Item .env.example .env
```

3. Set the server and UI environment variables in `.env`:

```env
SERVER_PORT=4000
SERVER_MONGO_URI=mongodb://localhost:27017/YieldFlow
SERVER_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SERVER_ALLOWED_ORIGINS=http://localhost:5173
SERVER_COOKIE_SAME_SITE=lax
SERVER_COOKIE_SECURE=false
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=http://localhost:4000
SERVER_SESSION_SECRET=replace-with-a-long-random-secret
SERVER_ADMIN_EMAILS=admin@example.com
SERVER_CSRF_STRICT_ORIGIN=true
SERVER_RATE_LIMIT_WINDOW_MS=900000
SERVER_AUTH_RATE_LIMIT_MAX=20
SERVER_WRITE_RATE_LIMIT_MAX=120
SERVER_IMPORT_RATE_LIMIT_MAX=10
SERVER_BACKUP_RESTORE_RATE_LIMIT_MAX=5
SERVER_TRUST_PROXY=false
SERVER_HEALTH_DETAIL_TOKEN=
```

Use `VITE_API_BASE_URL` when the frontend should call an absolute backend URL directly.
Leave it blank in local development and use `VITE_API_PROXY_TARGET` for the Vite `/api` proxy instead.

For cross-domain production deployments:
- set `VITE_API_BASE_URL` to your deployed API origin
- set `SERVER_ALLOWED_ORIGINS` to your deployed frontend origin
- set `SERVER_COOKIE_SAME_SITE=none`
- set `SERVER_COOKIE_SECURE=true`

4. Start the app:

```powershell
npm.cmd run dev
```

Frontend runs on Vite and proxies `/api` requests to the Express backend.

## Scripts

- `npm.cmd run dev` - run frontend and backend together
- `npm.cmd run build` - build the frontend
- `npm.cmd run lint` - run ESLint
- `npm.cmd test` - run API and financial logic tests
- `npm.cmd audit` - run npm dependency audit

## Architecture Notes

- The frontend is being split into feature-oriented modules so the app can scale beyond a single `App.jsx`.
- Funding references use stable event identifiers such as `maturity:<depositId>` and `interest:<depositId>:<yyyy-mm-dd>`.
- The app now operates against stored data only, with no in-memory demo fallback.
- Reference values such as owners, funding sources, institutions, branches, and instrument types now flow through a shared master-data model.
- MongoDB collections are isolated for this application in a dedicated YieldFlow database: `investments`, `masterData`, `users`, `sessions`, `portfolioShares`, and `auditLogs`.
- State-changing API requests are protected by strict Origin/Referer checks, request schemas deny unknown fields before writes, and production startup requires `SERVER_ALLOWED_ORIGINS`.
- Public health output is intentionally minimal; detailed health requires an admin session or `SERVER_HEALTH_DETAIL_TOKEN`.
- Audit logs store scoped action metadata and high-risk markers instead of routine full before/after snapshots.
- v2 admin controls should add MFA, just-in-time elevation, high-risk action alerts, and audit retention cleanup jobs.
- React user data should remain text-rendered; do not introduce `dangerouslySetInnerHTML` without a dedicated sanitizer and review.

## Roadmap

- Continue extracting dashboard and shared UI primitives into dedicated modules
- Add stronger automated testing around funding and archive rules
- Introduce first-class persisted cash-flow events for richer reporting
