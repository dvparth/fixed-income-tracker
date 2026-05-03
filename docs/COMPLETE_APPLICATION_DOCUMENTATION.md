# YieldFlow / Fixed Income Tracker — Comprehensive Technical & Domain Documentation

## 1) Product Intent and Domain Scope

YieldFlow is a full-stack fixed-income portfolio tracker focused on **instrument lifecycle lineage** rather than static holdings.

Core domain objective:
- track fixed-income investments (FD-like instruments, SCSS-like instruments, bond-like instruments),
- track recurring interest and maturity proceeds as cashflow events,
- link those proceeds into subsequent investments through explicit allocations,
- preserve auditability across owner portfolios, shared access, admin operations, and backup/restore workflows.

Unlike stock trackers that only model current holdings, this app models the **cash reuse chain** (“where did this investment’s money come from?”).

---

## 2) High-Level Architecture

### 2.1 Frontend
- React 19 + Vite SPA.
- Feature-oriented modules under `src/features/*`.
- Single app shell (`App.jsx`) routes via internal tab/view state (not React Router).
- API integration via `/api/*` endpoints (proxied in local dev or direct via `VITE_API_BASE_URL`).

### 2.2 Backend
- Express 5 API (`server/index.js`).
- MongoDB with Mongoose models for investments, users, sessions, master data, shares, and audit logs.
- Security posture includes:
  - strict request validation (Zod),
  - CORS allowlist,
  - cookie-based session auth,
  - origin/referer checks for state-changing methods,
  - rate limits by route class,
  - helmet hardening.

### 2.3 Shared Domain Modules
Reusable pure logic in `shared/*`:
- `fyTaxEngine.js`: FY tax estimation logic and owner-wise summary.
- `masterData.js`: normalize/empty master data model.
- `investmentImport.js`: import sheet metadata/contracts.
- `systemBackup.js`: backup workbook format contract.

---

## 3) Domain Model (Business Concepts)

### 3.1 Investment Record (Deposit)
Investment entries are stored in `investments` collection using a flexible schema (`strict: false`) with stable `id` field plus canonical fields such as:
- identity/meta: `id`, `srNo`, `notes`, timestamps,
- counterparties: `bankName`, `branchCity`, `holderName`, `fundingSource`,
- instrument: `instrumentType`, tenure components,
- economics: principal, rate, pre/post-tax maturity, payout values,
- dates: investment, maturity,
- operational status: `status`, `isDeleted`, `deletedAt`,
- lineage: `allocations[]`, `cashSettlements[]`.

### 3.2 Funding Event Lineage
Two foundational event identities are used:
- maturity event id pattern: `maturity:<depositId>`.
- interest event id pattern: `interest:<depositId>:<yyyy-mm-dd>` (used by app logic/UI flows).

Allocations connect new investments to these event IDs, enabling reinvestment traceability and preventing invalid archival/deletion when dependencies exist.

### 3.3 Master Data
Per owner portfolio:
- owners,
- institutions (+ branches),
- instrument types.

Master data is used for controlled vocabulary and canonicalization. Rename propagation and reconciliation routines update existing investments when master labels are updated.

### 3.4 Portfolio Access Model
- Owner has write authority to own portfolio.
- Owner can share read access with guest users via `portfolioShares`.
- Admin-only actions exist for high-risk operations (e.g., delete, backup restore, data export).

### 3.5 Audit Model
`auditLogs` captures actor, target, action, metadata and optional before/after snapshots with high-risk action awareness.

---

## 4) Data Storage and Collections

MongoDB collections referenced explicitly:
- `investments`
- `masterData`
- `users`
- `sessions`
- `portfolioShares`
- `auditLogs`

### Schema behaviors
- Investments are flexible (`strict: false`) to support evolving columns and import compatibility.
- MasterData/User/Session/Audit/Share use structured fields and indexes for integrity/perf.
- Unique indexes enforce key identities (e.g., user email/sub, session token hash, owner/guest pair).

---

## 5) Authentication, Authorization, and Session Lifecycle

### 5.1 Login
- Google credential token submitted to auth endpoint.
- Server validates token audience against configured Google client ID.
- User record upsert/update on login.
- Session token generated, hashed, persisted in `sessions`; raw token set in secure cookie.

### 5.2 Session
- Cookie name configurable (`SERVER_SESSION_COOKIE_NAME`, default `yieldflow_session`).
- TTL configurable via `SERVER_SESSION_TTL_DAYS`.
- `lastSeenAt` updated as request activity happens.

### 5.3 Authorization layers
- `requireAuth`: authenticated user required.
- `resolvePortfolioContext`: determines target owner context (self/shared).
- `requirePortfolioWriteAccess`: owner-only writes (or equivalent privileged conditions).
- `requireAdmin`: admin-only endpoints.

### 5.4 Admin role resolution
Role is inferred from either:
- explicit user `systemRole`, or
- membership in env-supplied `SERVER_ADMIN_EMAILS`.

---

## 6) API Surface (Functional Breakdown)

> Note: Paths below are representative from server routes.

### 6.1 Health and diagnostics
- Public minimal health response.
- Detailed health requires admin session or `SERVER_HEALTH_DETAIL_TOKEN`.

### 6.2 Authentication and user
- login/logout/session status endpoints.
- current user context endpoint.

### 6.3 Portfolio sharing
- create share (owner grants guest by email).
- list access relationships.
- revoke/remove share.

### 6.4 Deposits/Investments
- `GET /api/deposits`: list owner-scoped records (canonicalized via master data).
- `POST /api/deposits`: create.
- `PUT /api/deposits/:id`: update.
- `POST /api/deposits/:id/archive`: soft-delete with dependency checks.
- `DELETE /api/deposits/:id`: hard delete (admin), with funding-link cleanup.

### 6.5 Master data
- `GET /api/master-data`
- `PUT /api/master-data`
  - validates reference safety (cannot delete referenced values),
  - computes rename maps,
  - propagates renames to deposits,
  - reconciles deposit fields,
  - writes admin audit.

### 6.6 Tax estimation
- `GET /api/tax-estimation?fy=<fyLabel>`
- Uses shared FY tax engine with owner slab metadata.

### 6.7 Import and export
- Investment import preview/commit from XLSX.
- Admin JSON export endpoint for raw investment data.

### 6.8 Backup and restore
- Backup export to XLSX with versioned workbook contract.
- Preview validation endpoint before restore.
- Restore endpoint replaces current owner data in transaction.

---

## 7) Security Controls

### 7.1 Input validation
All sensitive routes validated with Zod schemas.
- Unknown fields denied (`.strict()` schemas).
- Structured 400 responses include normalized issue list.

### 7.2 Origin and CORS posture
- Explicit CORS allowlist from `SERVER_ALLOWED_ORIGINS`.
- In production, missing allowlist is fatal at startup.
- CSRF strict origin check for state-changing methods controlled by `SERVER_CSRF_STRICT_ORIGIN`.

### 7.3 Rate limiting
Distinct buckets tuned via env:
- auth,
- generic writes,
- import,
- backup/restore.

### 7.4 Headers and transport
- `helmet` baseline hardening.
- cookie secure/samesite configurable and defaults to production-safe behavior.

### 7.5 Audit and high-risk action traceability
High-risk actions (delete/restore/share changes/export etc.) are explicitly flagged and logged with metadata.

---

## 8) Financial and Tax Engine Details

`shared/fyTaxEngine.js` provides:
- FY label parsing,
- event-level aggregation into owner-wise summaries,
- tax slab-aware estimation logic,
- payout timing awareness for periodic interest.

Engine output is used by `FyTaxView` to render estimates and owner-level totals.

Important domain caveats:
- Estimation depends on correctness of payout mode, maturity dates, principal/maturity amounts, and owner slab config.
- Missing or malformed dates collapse some computations to safe defaults.

---

## 9) Import/Backup Contracts

### 9.1 Investment Import
`shared/investmentImport.js` defines required sheet + columns for imports.
Server pipeline includes:
- extension guard (`.xlsx`),
- sheet/column validation,
- parsing/normalization (dates, numbers, payout mode),
- derive fields where absent,
- optional dry-run,
- transactional create + master data augmentation.

### 9.2 Backup Workbook
`shared/systemBackup.js` defines:
- workbook version,
- expected sheet names,
- JSON column envelope for deposits.

Restore flow validates workbook shape and data consistency before transactionally replacing owner-scoped deposits/master data.

---

## 10) Frontend Module Deep Dive

### 10.1 App Shell (`src/App.jsx`)
Responsibilities:
- auth-aware app bootstrap,
- API calls and state hydration,
- top-level view/tab orchestration,
- wiring feature panels (deposits/editor/tax/masters/admin/settings/sharing/import).

### 10.2 Deposits List (`DepositsView.jsx`)
- renders portfolio rows/cards,
- filtering/sorting/grouping behavior,
- action triggers: edit, archive, delete (role-aware), export/import hooks,
- highlights allocation relationships and statuses.

### 10.3 Deposit Editor (`DepositEditorView.jsx`)
- comprehensive form model for investment fields,
- payout mode and date logic,
- allocation editing and validation,
- derived value calculation helpers,
- save/update flow to API.

### 10.4 Deposit Domain Utilities (`depositModel.js`)
- normalization helpers,
- derived calculations (tenure/interest/tds/labels etc.),
- UI-safe defaults and conversions.

### 10.5 Master Data UI (`MastersView.jsx`)
- CRUD for owners/institutions/branches/instrument types,
- rename/change visualization,
- server-side violation handling surfaced to user.

### 10.6 Tax UI (`FyTaxView.jsx`)
- FY selector,
- owner-wise cards/tables,
- computed totals and explanatory labels.

### 10.7 Admin UI (`AdminView.jsx`, `exportWorkbook.js`)
- privileged data export,
- high-risk actions with guardrails,
- workbook export generation utilities.

### 10.8 Backup/Restore UI (`BackupRestorePanel.jsx`)
- backup download,
- preview before restore,
- validation issues display,
- irreversible-action messaging.

### 10.9 Portfolio Sharing UI (`PortfolioAccessPanel.jsx`)
- invite by guest email,
- list active shares,
- revoke operations.

### 10.10 Import UI (`BulkImportPanel.jsx`, `importTemplateWorkbook.js`)
- guided workbook import,
- template download,
- dry run + error display,
- commit operation and summary.

### 10.11 Auth UI (`AuthView.jsx`, `googleIdentity.js`)
- google identity bootstrap,
- credential acquisition and login handoff,
- signed-in/out UX transitions.

---

## 11) Configuration Matrix (Environment)

Key backend env variables:
- connectivity: `SERVER_PORT`, `SERVER_MONGO_URI`
- auth: `SERVER_GOOGLE_CLIENT_ID`, `SERVER_SESSION_SECRET`, cookie controls
- security: `SERVER_ALLOWED_ORIGINS`, `SERVER_CSRF_STRICT_ORIGIN`, rate limits
- ops: upload max size, health detail token, trust proxy
- roles: `SERVER_ADMIN_EMAILS`

Frontend env variables:
- `VITE_API_BASE_URL`
- `VITE_API_PROXY_TARGET`
- `VITE_GOOGLE_CLIENT_ID`

Deployment-sensitive combinations:
- cross-domain cookie auth requires `SameSite=None` + `Secure=true` + HTTPS.

---

## 12) Error Handling & Observability

- Each request has requestId correlation in error responses/logs.
- Centralized error middleware maps:
  - Zod errors => 400 structured issues,
  - CORS violation => 403,
  - all else => bounded 4xx/5xx fallback.
- Console logs include method/path/status/message/stack for server diagnostics.

---

## 13) Testing Inventory

### Existing automated tests
- `tests/securityMiddleware.test.js`
  - security headers/middleware expectations,
  - request safety boundaries.
- `tests/fyTaxEngine.test.js`
  - financial-year parsing and tax summary correctness scenarios.

Gaps (recommended future tests):
- end-to-end auth + share permissions,
- import preview/commit edge cases,
- backup restore rollback guarantees,
- archive dependency graph edge cases,
- master rename propagation invariants,
- rate-limit behavior under load.

---

## 14) Known Design Trade-offs

1. **Flexible investment schema (`strict: false`)**
   - Pros: migration agility, import resilience.
   - Cons: requires strict API validation and careful downstream assumptions.

2. **Single-file backend (`server/index.js`)**
   - Pros: direct traceability in early-stage product.
   - Cons: maintainability pressure as route count grows.

3. **Cookie session model**
   - Pros: centralized revocation and server authority.
   - Cons: requires careful cross-origin cookie configuration.

4. **Master-data canonicalization layer**
   - Pros: consistent vocabulary/reporting.
   - Cons: rename propagation complexity and migration risk.

---

## 15) Suggested Documentation Derivatives (for later phases)

This master document can be split into:
1. **API Reference** (endpoint-by-endpoint contract).
2. **Security Runbook** (threat model + controls + incident response).
3. **Data Dictionary** (field semantics and constraints).
4. **Operations Playbook** (deploy, backup, restore, rollback).
5. **QA Test Plan** (functional + non-functional cases).
6. **Domain Rules Manual** (investment lifecycle and tax assumptions).
7. **Onboarding Guide** (developer setup and architecture walkthrough).

---

## 16) Immediate Next-Step Recommendations

1. Extract backend into modules:
   - auth, deposits, master-data, import, backup, audit, middleware.
2. Add OpenAPI spec from route schemas.
3. Add integration tests for auth/share/backup/import pipelines.
4. Add migration/versioning policy for investment payload evolution.
5. Implement audit retention and alerting for high-risk actions.

