# YieldFlow / Fixed Income Tracker

YieldFlow is a mobile-first full-stack app for managing fixed-income portfolios: bank fixed deposits, SCSS-style positions, bonds, recurring interest payouts, maturity proceeds, reinvestment lineage, financial-year tax estimation, sharing, and backup/restore workflows.

The app is built around one practical domain problem: fixed-income investments are not isolated records. Matured principal and periodic interest often fund later investments, so YieldFlow tracks those cash events and their reuse explicitly.

## Highlights

- Track FDs, SCSS, bonds, and similar fixed-income instruments.
- Record owners, institutions, branches, instrument types, rates, maturity values, TDS, payout schedules, and notes.
- Generate reusable cash events from maturities and periodic interest payouts.
- Link new investments to prior maturity or interest events through allocation records.
- View upcoming maturities, pending interest cash, FY gross interest receipts, owner summaries, grouped deposits, and reinvestment usage.
- Estimate owner-wise financial-year interest, TDS, taxable interest, and additional tax liability.
- Manage master data for owners, institutions, branches, aliases, instrument types, and owner tax slabs.
- Sign in with Google, use cookie-backed server sessions, and share portfolios read-only with other users.
- Export admin workbooks, import investments from Excel, and back up or restore full portfolio snapshots.
- Use a public demo portfolio when demo mode is enabled.

## Tech Stack

- React 19 + Vite
- Express 5
- MongoDB + Mongoose
- Zod request validation
- Google Identity Services
- `xlsx` for import/export/backup workbooks
- Plain CSS with mobile-first responsive behavior
- Node built-in test runner + Supertest

## Project Structure

```text
src/
  App.jsx                         Main SPA shell and state orchestration
  App.css                         Application styles
  features/
    admin/                        Admin export UI and workbook generation
    auth/                         Google Identity login helpers and auth view
    deposits/                     Deposit list/detail UI and deposit domain helpers
    editor/                       Add/edit investment form
    import/                       Excel import panel and template generation
    masters/                      Master data management UI
    settings/                     Backup/restore UI, including Google Drive backup
    sharing/                      Portfolio access management UI
    tax/                          Financial-year tax estimate UI

server/
  index.js                        Express API, middleware, schemas, routes, models

shared/
  demoPortfolio.js                Public demo portfolio seed snapshot
  fyTaxEngine.js                  Financial-year accrual and tax estimation logic
  investmentImport.js             Import workbook sheet/column contract
  masterData.js                   Master-data normalization and owner alias helpers
  systemBackup.js                 Backup workbook contract

tests/
  demoMode.test.js
  fyTaxEngine.test.js
  securityMiddleware.test.js
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

3. Configure `.env`. The usual local defaults are:

```env
SERVER_PORT=4000
SERVER_MONGO_URI=mongodb://localhost:27017/YieldFlow
SERVER_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SERVER_ALLOWED_ORIGINS=http://localhost:5173
SERVER_SESSION_SECRET=replace-with-a-long-random-secret
SERVER_ADMIN_EMAILS=admin@example.com
SERVER_COOKIE_SAME_SITE=lax
SERVER_COOKIE_SECURE=false
SERVER_CSRF_STRICT_ORIGIN=true
SERVER_TRUST_PROXY=false
SERVER_DEMO_ENABLED=true
SERVER_DEMO_OWNER_ID=demo-owner-yieldflow

VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=http://localhost:4000
VITE_GOOGLE_SIGN_IN_UX_MODE=popup
VITE_DEFAULT_BACKUP_DESTINATION=local
```

Use `VITE_API_BASE_URL` when the frontend should call an absolute deployed API origin. Leave it blank in local development and use `VITE_API_PROXY_TARGET` so Vite proxies `/api` to Express.

For cross-domain production deployments:

- set `VITE_API_BASE_URL` to the deployed API origin,
- set `SERVER_ALLOWED_ORIGINS` to the deployed frontend origin,
- set `SERVER_COOKIE_SAME_SITE=none`,
- set `SERVER_COOKIE_SECURE=true`,
- run over HTTPS.

Google sign-in defaults to popup mode. Redirect mode is available by setting
`VITE_GOOGLE_SIGN_IN_UX_MODE=redirect`, but the backend callback URL must first
be added to the Google Cloud OAuth client Authorized redirect URIs, such as
`http://localhost:4000/api/auth/google/redirect` for local development.

4. Start the app:

```powershell
npm.cmd run dev
```

The client runs through Vite and proxies `/api` requests to the Express backend.

## Scripts

- `npm.cmd run dev` - run frontend and backend together.
- `npm.cmd run client` - run only Vite.
- `npm.cmd run server` - run only Express.
- `npm.cmd run build` - build the frontend.
- `npm.cmd run lint` - run ESLint.
- `npm.cmd test` - run API/security/domain tests.
- `npm.cmd audit` - run npm dependency audit.
- `npm.cmd run seed:demo` - seed the public read-only demo portfolio in MongoDB.
- `npm.cmd run preview` - preview the production frontend build.

## API Overview

The backend lives in `server/index.js` and exposes these route groups:

- Health: `/api/health`, `/api/health/details`
- Demo: `/api/demo/portfolio`, `/api/demo/tax-estimation`
- Auth: `/api/auth/session`, `/api/auth/google`, `/api/auth/logout`
- Sharing: `/api/shares`
- Investments: `/api/deposits`, `/api/deposits/:id`, `/api/deposits/:id/archive`
- Master data: `/api/master-data`
- Tax: `/api/tax-estimation`
- Import: `/api/investment-import`
- Admin export: `/api/admin/export-data`
- Backup/restore: `/api/data-backup/export`, `/api/data-backup/preview`, `/api/data-backup/restore`

Most portfolio routes are owner-scoped. Shared portfolios are read-only for guests. Admin-only routes are guarded separately.

## Domain Notes

- Funding references use stable event IDs:
  - `maturity:<depositId>`
  - `interest:<depositId>:<yyyy-mm-dd>`
- Master data is owner-scoped and canonicalizes owner, institution, branch, and instrument labels.
- Owner aliases and owner tax slab rates feed search and tax estimation.
- Periodic payout products can generate interest events before maturity.
- Dashboard FY gross interest receipts are separate from taxable interest estimates: the receipt view shows interest scheduled in the selected FY before TDS, including maturity interest that may have accrued across earlier FYs.
- Archive prevents removing investments still used as funding sources.
- Hard delete is admin-only and cleans dependent funding links.
- Public demo endpoints are disabled unless `SERVER_DEMO_ENABLED=true`.
- Backup restore replaces owner-scoped deposits and master data after workbook validation.

## Security Notes

- Google credential tokens are verified server-side.
- Sessions are stored in MongoDB as hashed tokens and sent as HTTP cookies.
- Production startup requires `SERVER_ALLOWED_ORIGINS`.
- State-changing API requests are protected by strict Origin/Referer checks when `SERVER_CSRF_STRICT_ORIGIN=true`.
- Zod schemas deny unknown fields on sensitive writes.
- Route-specific rate limits protect auth, writes, import, demo, and backup/restore endpoints.
- Public health output is intentionally minimal; detailed health requires an admin session or `SERVER_HEALTH_DETAIL_TOKEN`.
- Audit logs capture scoped action metadata and high-risk operations.

## Tests

Current tests cover:

- financial-year interest accrual and tax estimation behavior,
- public demo isolation and demo rate limiting,
- health endpoint privacy,
- production origin/CSRF checks,
- strict schema rejection of unexpected auth fields,
- production startup guardrails.

Run them with:

```powershell
npm.cmd test
```

## Current Maintainability Notes

- `src/App.jsx` and `server/index.js` are still large orchestration files. New work should prefer extracting route handlers, services, hooks, and feature modules when the change naturally creates a boundary.
- The investment Mongo schema is intentionally flexible for import and migration agility, so API validation and shared normalization are the real contracts.
- The comprehensive technical/domain document lives at `docs/COMPLETE_APPLICATION_DOCUMENTATION.md`.
- There are visible encoding artifacts in some existing UI copy, such as `â€¢`; those should be cleaned in a focused UI text pass.

## Roadmap

- Continue extracting dashboard, API, and backend route modules.
- Add integration tests for auth/share/import/backup/archive flows.
- Add an OpenAPI-style endpoint contract generated from or aligned with Zod schemas.
- Introduce first-class persisted cash-flow events for richer reporting.
- Add audit retention cleanup, high-risk alerts, MFA or just-in-time elevation for admin operations.
