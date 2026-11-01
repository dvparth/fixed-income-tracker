# YieldFlow / Fixed Income Tracker - Comprehensive Technical and Domain Documentation

## 1. Product Intent

YieldFlow is a full-stack fixed-income portfolio tracker focused on investment lifecycle lineage. It tracks fixed deposits, SCSS-style instruments, bond-style instruments, recurring interest, maturity proceeds, and the reuse of those cashflows into later investments.

The defining product goal is traceability: the app should answer not only "what investments do I hold?" but also "where did this investment's money come from, what cash is still available, and what tax impact is expected this financial year?"

Core capabilities:

- track owner-wise fixed-income investments,
- model maturity and periodic interest as reusable cash events,
- allocate later investments against prior cash events,
- estimate owner-wise financial-year interest and tax,
- show FY gross interest receipts separately from taxable interest estimates,
- manage owner/institution/branch/instrument master data,
- provide Google sign-in and owner-scoped portfolio access,
- support read-only portfolio sharing,
- track monthly salary investment targets and their allocation to investments,
- model prorated first and final interest periods for quarterly payout products,
- import investments from Excel,
- export admin workbooks,
- back up and restore complete portfolio snapshots,
- expose a public read-only demo portfolio when enabled.

## 2. High-Level Architecture

### 2.1 Frontend

- React 19 + Vite single-page app.
- Main shell: `src/App.jsx`.
- Feature modules under `src/features/*`.
- Internal tab/view state is used instead of React Router for the authenticated app.
- Static legal/demo routes are handled in app-level view logic.
- API calls go through `/api/*` locally with Vite proxy support, or through `VITE_API_BASE_URL` for deployed cross-origin APIs.

### 2.2 Backend

- Express 5 API in `server/index.js`.
- MongoDB persistence through Mongoose.
- Route validation through Zod.
- File upload handling through Multer memory storage.
- Workbook parsing and generation through `xlsx`.
- Security middleware includes Helmet, CORS allowlist, cookie sessions, CSRF-style Origin/Referer checks, and route-specific rate limits.

### 2.3 Shared Domain Modules

Shared code is imported by both frontend and backend where useful:

- `shared/fyTaxEngine.js`: daily accrual, financial-year clipping, owner-wise tax estimates.
- `shared/masterData.js`: master-data normalization, owner aliases, tax slab metadata.
- `shared/investmentImport.js`: import workbook sheet and column contract.
- `shared/demoPortfolio.js`: public demo snapshot and default demo owner id.
- `shared/systemBackup.js`: backup workbook sheet/version contract, including salary savings.

## 3. Data Model

### 3.1 MongoDB Collections

- `investments`
- `masterData`
- `users`
- `sessions`
- `portfolioShares`
- `auditLogs`
- `salarySavings`

### 3.2 Investment Record

Investments are stored in the `investments` collection. The Mongoose schema uses `strict: false` to keep import and migration flexible, but API writes are constrained by Zod schemas.

Important fields include:

- identity and metadata: `id`, `srNo`, `notes`, timestamps,
- ownership: `ownerUserId`, `createdByUserId`, `updatedByUserId`,
- parties: `holderName`, `fundingSource`, `bankName`, `branchCity`,
- instrument: `instrumentType`, `calculationFrequency`, `payoutMode`, `yearlyPayoutMonthDay`,
- payout schedule details: `interestPayoutSchedule`, `interestPayoutOverrides`,
- dates and tenure: `investmentDate`, `maturityDate`, `tenureYears`, `tenureMonths`, `tenureDays`,
- amounts: `principalAmount`, `interestRate`, `maturityBeforeTax`, `maturityAfterTax`, `totalInterestEarned`, `tdsPercent`, `tdsAmount`,
- periodic interest: `interestPayoutBeforeTds`, `interestPayoutAfterTds`,
- lifecycle: `status`, `isDeleted`, `deletedAt`,
- lineage: `allocations[]`, `cashSettlements[]`.

### 3.3 Funding Event IDs

The app uses stable string IDs for cash events:

- maturity proceeds: `maturity:<depositId>`
- periodic interest: `interest:<depositId>:<yyyy-mm-dd>`

Investment `allocations[]` point to those event IDs. This lets the app show reinvestment lineage, compute remaining allocable cash, and block unsafe archive operations when a deposit still funds later investments.

### 3.4 Master Data

Master data is owner-scoped and stored in `masterData`:

- owners, including aliases, owner type, and tax slab rate,
- institutions,
- branches under institutions,
- instrument types.

Master data provides controlled vocabulary and canonical labels. Server update logic prevents deleting referenced master values, computes rename maps, propagates renames to existing investments, and reconciles deposit fields after updates.

### 3.5 Users, Sessions, Shares, and Audit Logs

- `users`: Google identity, email, display name, photo URL, system role.
- `sessions`: hashed session token, user id, expiry, last seen timestamp.
- `portfolioShares`: owner-to-guest read-only access records.
- `auditLogs`: actor, target, action, before/after details where useful, and metadata for high-risk operations.

### 3.6 Salary Savings

Monthly salary savings are stored separately from investments in the `salarySavings` collection. Each record is scoped to a portfolio owner and has a `salaryMonth` (`YYYY-MM`) and positive target `amount`. A unique owner/month index allows at most one record per month.

Each record can include:

- `investmentAllocations[]`: investment ID and amount links representing salary funds assigned to investments,
- `unavailable[]`: amounts that could not be invested, with a reason,
- optional notes and create/update actor metadata.

The API derives current invested, historical, unavailable, and to-be-invested amounts from these entries. Links to closed investments remain as history and do not count toward current invested totals or the monthly target. A renewal creates a successor investment with a `parentInvestmentId`; the renewal dialog lets users assign any portion of each parent-linked salary source to that successor. The renewal, parent closure, and new salary links are committed in one transaction. Any unassigned portion returns to the salary month's to-be-invested balance. Salary links are separate from maturity/interest cash-event allocations. Archiving or permanently deleting an investment is blocked while salary links remain.

## 4. Authentication and Authorization

### 4.1 Login

The frontend uses Google Identity Services. It sends the credential token to `POST /api/auth/google`; the server validates the token audience against `SERVER_GOOGLE_CLIENT_ID`, upserts the user, creates a session record, and writes a session cookie.

### 4.2 Session Model

- Cookie name defaults to `yieldflow_session` and is configurable with `SERVER_SESSION_COOKIE_NAME`.
- Session lifetime is controlled by `SERVER_SESSION_TTL_DAYS`.
- Raw session tokens are not stored; token hashes are persisted in MongoDB.
- Client-side inactivity warning/timeout behavior is configured by `VITE_SESSION_WARNING_MINUTES`, `VITE_SESSION_TIMEOUT_MINUTES`, and `VITE_SESSION_ACTIVITY_THROTTLE_SECONDS`.

### 4.3 Authorization Layers

The backend uses layered middleware:

- `requireAuth`: authenticated session required.
- `requireUserRole`: regular signed-in user required.
- `resolvePortfolioContext`: determines whether the request targets the user's own portfolio or a shared portfolio.
- `requirePortfolioWriteAccess`: owner-only write access.
- `requireAdmin`: admin-only operations.

Admin status is resolved from the stored `systemRole` or membership in `SERVER_ADMIN_EMAILS`.

## 5. API Surface

### 5.1 Health

- `GET /api/health`: public minimal service status.
- `GET /api/health/details`: detailed diagnostics, available to an admin session or a valid `SERVER_HEALTH_DETAIL_TOKEN`.

### 5.2 Demo

- `GET /api/demo/portfolio`: public demo portfolio snapshot.
- `GET /api/demo/tax-estimation?fy=<yyyy-yy>`: public demo tax estimate.

Demo endpoints are hidden unless `SERVER_DEMO_ENABLED=true`. They use `SERVER_DEMO_OWNER_ID` and their own rate limit.

### 5.3 Auth

- `GET /api/auth/session`: current session and accessible portfolios.
- `POST /api/auth/google`: Google credential login.
- `POST /api/auth/logout`: session logout.

### 5.4 Sharing

- `GET /api/shares`: list outgoing shares and incoming shared portfolios.
- `POST /api/shares`: grant read access by guest email.
- `DELETE /api/shares/:id`: revoke share.

### 5.5 Investments

- `GET /api/deposits`: list owner-scoped investments, canonicalized against master data.
- `POST /api/deposits`: create investment.
- `PUT /api/deposits/:id`: update investment.
- `POST /api/deposits/:id/renew`: close an investment and atomically create its successor, preserving the parent link and manually assigned salary sources.
- `POST /api/deposits/:id/archive`: soft-delete with dependency checks.
- `DELETE /api/deposits/:id`: admin-only hard delete with dependent funding-link cleanup.

Owner scope is selected through `ownerUserId` query parameters when accessing shared or admin-relevant portfolios.

Quarterly products may opt into the `prorated-boundaries-v1` interest schedule. In addition to regular quarterly events, the schedule generates a first-period payout from the investment date to the first later FY quarter end and a final-period payout from the last quarter end to maturity, when needed. Both are separate interest events; maturity proceeds remain a distinct principal event.

### 5.6 Salary Savings

- `GET /api/salary-savings?ownerUserId=<id>`: return owner-scoped records enriched with investment labels and derived totals. Read-only shared portfolio access is supported.
- `POST /api/salary-savings?ownerUserId=<id>`: create a monthly target; requires portfolio write access.
- `PUT /api/salary-savings/:id?ownerUserId=<id>`: update a target; requires portfolio write access.

Writes validate the `YYYY-MM` month, positive target/line amounts, non-empty unavailability reasons, linked investment availability, and target/principal allocation limits. Creating a second record for the same owner/month returns a conflict. The interface filters records by selected April–March financial year, counts only open investments toward invested totals, and expands closed/superseded links as investment history.

### 5.7 Master Data

- `GET /api/master-data`: fetch owner-scoped master data.
- `PUT /api/master-data`: update owner-scoped master data, validate reference safety, propagate renames, and reconcile investment labels.

### 5.8 Tax Estimation

- `GET /api/tax-estimation?fy=<yyyy-yy>`: owner-wise FY tax estimate for authenticated portfolio data.

The API maps investments into the shared FY tax engine and uses owner tax slab metadata from master data.

### 5.9 Import

- `POST /api/investment-import?dryRun=true`: parse and validate an Excel workbook without writing.
- `POST /api/investment-import?dryRun=false`: import valid investments and augment master data transactionally.

The workbook contract is defined by `shared/investmentImport.js`.

### 5.10 Admin Export

- `GET /api/admin/export-data`: admin-only JSON payload used by frontend workbook export logic.

### 5.11 Backup and Restore

- `GET /api/data-backup/export`: owner-scoped XLSX backup.
- `POST /api/data-backup/preview`: validate a backup workbook and return preview rows/issues.
- `POST /api/data-backup/restore`: transactionally replace owner-scoped deposits, salary savings, and master data from a validated backup workbook.

The backup workbook contract is defined by `shared/systemBackup.js`.

## 6. Frontend Module Map

### 6.1 `src/App.jsx`

Responsibilities:

- app bootstrap and session hydration,
- authenticated/demo/legal view orchestration,
- dashboard calculations, including FY gross interest receipt views for maturity interest and periodic interest payouts,
- top-level state for deposits, master data, filters, active portfolio, and session timeout,
- API calls and owner-scoped paths,
- wiring child feature modules.
- successful portfolio-action feedback for investment create/edit, renew, close, cash settlement, archive, and delete operations. Feedback is announced as a polite status message and can be dismissed; API failures continue to use the existing error banner or form-level error.

The dashboard Owners panel groups non-deleted investments by holder and shows each holder's open-investment count and total principal. Selecting an owner filters dashboard metrics and cash-flow views for that holder; the owner cards remain visible for all holders. The bank/issuer breakdown is always shown and totals principal from open investments in the current dashboard scope, grouped by bank or issuer. With no owner selected, it summarizes the whole active portfolio.

Dashboard presentation is implemented in `src/features/dashboard/DashboardView.jsx`, with dashboard state and derived collections in `src/features/dashboard/useDashboardModel.js`. The "Needs attention" panel links available maturity/interest cash, near-term maturities, and expected near-term interest payouts to their relevant review views.

`src/features/dashboard/dashboardModel.js` contains dashboard aggregations, including issuer grouping. The issuer aggregation excludes investments that are not open, groups blank issuer names under "Unknown issuer", and sorts by principal descending with issuer name as a tie-breaker.

### 6.2 Deposits

- `src/features/deposits/DepositsView.jsx`: coordinates grouped investment list and selected-investment detail behavior, filters, cash summaries, and investment actions.
- `src/features/deposits/DepositListPanel.jsx`: grouped investment list, status sections, and list filters.
- `src/features/deposits/DepositDetailPanel.jsx`: investment detail, lifecycle actions, cash activity, and cashflow timeline presentation.
- `src/features/deposits/depositTimeline.js`: builds chronological investment, interest, reinvestment, settlement, and maturity/closure timeline entries.
- `src/features/deposits/depositModel.js`: date, tenure, currency, TDS, allocation, interest-event, normalization, and request helpers.

The detail view prioritizes principal, maturity or received date, payout schedule when applicable, interest rate, and the next actionable step. Cash activity (received, reinvested, upcoming, and available cash) and secondary terms, funding/notes, maturity usage, and the full interest schedule are disclosed in expandable sections. The timeline previews a small number of chronological cashflow events and can expand to show the full history. On mobile, supporting detail sections remain in the mobile accordion layout.

### 6.3 Editor

- `src/features/editor/DepositEditorView.jsx`: investment create/edit form, product behavior controls, periodic payout setup, funding allocation UI, derived summaries.
- Salary funding is shown separately from maturity/interest cash funding. When editing an investment, the editor summarizes linked salary months and amounts, and distinguishes linked salary funds from the principal funded elsewhere.

### 6.4 Salary Savings

- `src/features/salary/SalarySavingsView.jsx`: monthly target create/edit form, investment links, unavailable-amount reasons, financial-year filtering, summary/record display, and accessible success/error feedback after save. Shared portfolios and demo mode are read-only.
- `src/features/salary/salarySavingsModel.js`: April–March filtering and target/invested/unavailable/remaining and per-investment funding summaries.

### 6.5 Master Data

- `src/features/masters/MastersView.jsx`: owners, institutions, branches, instrument types, aliases, tax slab configuration, validation feedback.

### 6.6 Tax

- `src/features/tax/FyTaxView.jsx`: FY selector, owner summaries, taxable interest, estimated TDS, additional liability, confidence labels.

### 6.7 Import

- `src/features/import/BulkImportPanel.jsx`: upload, dry-run preview, error display, confirmed import.
- `src/features/import/importTemplateWorkbook.js`: import template generator.

### 6.8 Backup and Settings

- `src/features/settings/BackupRestorePanel.jsx`: local backup download, Google Drive backup using `drive.file`, backup preview, restore confirmation.

### 6.9 Sharing

- `src/features/sharing/PortfolioAccessPanel.jsx`: create and revoke read-only shares.

### 6.10 Admin

- `src/features/admin/AdminView.jsx`: privileged export UI.
- `src/features/admin/exportWorkbook.js`: workbook generation for admin export.

### 6.11 Auth

- `src/features/auth/AuthView.jsx`: Google sign-in UI.
- `src/features/auth/googleIdentity.js`: Google script loading and access-token helpers for Drive backup.

## 7. Financial-Year Tax Engine

`shared/fyTaxEngine.js` is the central tax-estimation module.

Important behavior:

- Parses FY labels such as `2025-26`.
- Builds daily interest accrual timelines.
- Clips accrual to a selected FY.
- Supports cumulative and periodic payout products.
- Normalizes calculation frequency and payout frequency.
- Uses quarterly compounding as the default for cumulative at-maturity products when needed.
- Groups output owner-wise.
- Applies owner tax slab rates from master data.
- Estimates taxable interest, TDS at 10%, and additional tax liability above TDS.

Output is an estimate. It depends on correct principal, dates, rate, payout mode, calculation frequency, and owner tax slab configuration.

The dashboard deliberately separates this taxable-interest estimate from FY gross interest receipts. Taxable interest is accrual-oriented and may be spread across financial years. Gross interest receipts are schedule-oriented: they show interest before TDS in the selected FY, including full maturity interest for deposits maturing in that FY and periodic payout events dated inside that FY.

### 7.1 Quarterly prorated payout schedule

Quarterly payout dates follow the financial-year quarter ends (June 30, September 30, December 31, and March 31). Existing quarterly products retain their fixed per-event payout behavior unless the `prorated-boundaries-v1` schedule is selected.

With that schedule enabled, the first period runs from the investment date to the first later quarter end, and the final period runs from the last quarter end to maturity if maturity does not coincide with that boundary. The calculated gross amount uses simple daily interest: principal × annual rate × elapsed days / 365, rounded to currency precision. The net suggestion uses the entered standard net-to-gross payout ratio when both are available; otherwise it applies the configured TDS percentage, defaulting to 10%. Optional `first` and `final` overrides can replace gross and/or net values with actual payout amounts. Regular full-quarter payouts continue to use the standard payout amounts, and maturity principal is still represented by the separate maturity event.

## 8. Import and Backup Contracts

### 8.1 Import Workbook

`shared/investmentImport.js` defines:

- sheet name: `Investments`,
- required columns: holder, issuer, account/certificate number, instrument type, principal, investment date, maturity date, status,
- optional columns for funding source, branch, payout mode, interest values, maturity values, interest payment date, and notes.

The server validates workbook shape, normalizes dates/numbers/payout modes, validates periodic payout requirements, derives fields where possible, creates new master values when needed, and writes records in a transaction for confirmed imports.

### 8.2 Backup Workbook

`shared/systemBackup.js` defines the current backup version (`2`) and these sheets:

- `Metadata`
- `Owners`
- `Institutions`
- `Branches`
- `InstrumentTypes`
- `Deposits`
- `Salary Savings`

Deposit and salary savings rows carry a `Record Data` JSON column so the backup can preserve full payloads while still exposing readable summary columns, including payout overrides, parent investment lineage, funding links, and timestamps. Version 3 requires a recognized backup type/version, record counts for all sheets, and the `Salary Savings` sheet; parent investment references are validated before restore. Versions 1 and 2 remain supported. If a version 1 backup has no `Salary Savings` sheet, the destination's existing salary records are preserved only when their links validate against the restored investments. The preview identifies that compatibility behavior.

The preview displays the backup source and restore destination. Restoring a backup from a different or unidentified source requires an explicit confirmation. Restore converts serialized record timestamps back to database dates and replaces the destination's investments, salary savings, and master data transactionally. User accounts, sessions, portfolio shares, and audit history are not included in portfolio backups.

## 9. Security Controls

### 9.1 Request Validation

Sensitive routes use strict Zod schemas. Unknown fields are rejected before writes.

### 9.2 CORS and Origin Checks

- `SERVER_ALLOWED_ORIGINS` controls allowed browser origins.
- Production startup fails if `SERVER_ALLOWED_ORIGINS` is empty.
- `SERVER_CSRF_STRICT_ORIGIN=true` requires trusted Origin/Referer metadata for state-changing methods.

### 9.3 Rate Limits

Route classes have separate limits:

- auth: `SERVER_AUTH_RATE_LIMIT_MAX`,
- writes: `SERVER_WRITE_RATE_LIMIT_MAX`,
- import: `SERVER_IMPORT_RATE_LIMIT_MAX`,
- backup/restore: `SERVER_BACKUP_RESTORE_RATE_LIMIT_MAX`,
- demo: `SERVER_DEMO_RATE_LIMIT_MAX`.

All share `SERVER_RATE_LIMIT_WINDOW_MS`.

### 9.4 Cookies and Deployment

Cross-domain cookie auth requires:

- `SERVER_COOKIE_SAME_SITE=none`,
- `SERVER_COOKIE_SECURE=true`,
- HTTPS,
- frontend `VITE_API_BASE_URL` pointing to the API origin,
- API `SERVER_ALLOWED_ORIGINS` including the frontend origin.

Google sign-in defaults to popup mode. Redirect mode is available with
`VITE_GOOGLE_SIGN_IN_UX_MODE=redirect`, but the backend callback URL, such as
`http://localhost:4000/api/auth/google/redirect`, must be registered in the
Google Cloud OAuth client's Authorized redirect URIs.

### 9.5 Audit Logging

High-risk and admin actions write audit records with actor, target, action, owner scope, and contextual metadata. Examples include delete, restore, export, master-data changes, and share changes.

## 10. Environment Configuration

Backend:

- `SERVER_PORT`
- `SERVER_MONGO_URI`
- `SERVER_GOOGLE_CLIENT_ID`
- `SERVER_ALLOWED_ORIGINS`
- `SERVER_SESSION_SECRET`
- `SERVER_ADMIN_EMAILS`
- `SERVER_COOKIE_SAME_SITE`
- `SERVER_COOKIE_SECURE`
- `SERVER_SESSION_COOKIE_NAME`
- `SERVER_SESSION_TTL_DAYS`
- `SERVER_UPLOAD_MAX_MB`
- `SERVER_BACKUP_PREVIEW_ROW_LIMIT`
- `SERVER_CSRF_STRICT_ORIGIN`
- `SERVER_TRUST_PROXY`
- `SERVER_RATE_LIMIT_WINDOW_MS`
- `SERVER_AUTH_RATE_LIMIT_MAX`
- `SERVER_WRITE_RATE_LIMIT_MAX`
- `SERVER_IMPORT_RATE_LIMIT_MAX`
- `SERVER_BACKUP_RESTORE_RATE_LIMIT_MAX`
- `SERVER_HEALTH_DETAIL_TOKEN`
- `SERVER_DEMO_ENABLED`
- `SERVER_DEMO_OWNER_ID`
- `SERVER_DEMO_RATE_LIMIT_MAX`

Frontend:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_BASE_URL`
- `VITE_API_PROXY_TARGET`
- `VITE_GOOGLE_IDENTITY_SCRIPT_URL`
- `VITE_GOOGLE_SIGN_IN_UX_MODE`
- `VITE_GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_SECONDS`
- `VITE_GOOGLE_DRIVE_SCOPE`
- `VITE_GOOGLE_DRIVE_BACKUP_FOLDER_NAME`
- `VITE_GOOGLE_DRIVE_API_PAGE_SIZE`
- `VITE_DEFAULT_BACKUP_DESTINATION`
- `VITE_SESSION_WARNING_MINUTES`
- `VITE_SESSION_TIMEOUT_MINUTES`
- `VITE_SESSION_ACTIVITY_THROTTLE_SECONDS`
- `VITE_DASHBOARD_PREVIEW_LIMIT`
- `VITE_DASHBOARD_UPCOMING_CASH_WINDOW_DAYS`
- `VITE_DEPOSIT_MATURING_SOON_WINDOW_DAYS`
- `VITE_DEPOSIT_GROUP_SECTION_LIMIT`

## 11. Local Development

Install dependencies:

```powershell
npm.cmd install
```

Copy env:

```powershell
Copy-Item .env.example .env
```

Run both frontend and backend:

```powershell
npm.cmd run dev
```

Useful scripts:

- `npm.cmd run client`
- `npm.cmd run server`
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run seed:demo`
- `npm.cmd run preview`

## 12. Testing Inventory

Current tests:

- `tests/dashboardModel.test.js`: active investment issuer grouping, principal totals, unknown issuers, and sorting.
- `tests/demoMode.test.js`: demo seed/data isolation, demo tax endpoint, rate limiting, and endpoint availability.
- `tests/fyTaxEngine.test.js`: FY parsing, daily accrual, compounding, payout behavior, cross-FY reconciliation.
- `tests/interestPayoutSchedule.test.js`: prorated first/final quarterly payouts, overrides, default TDS, editing compatibility, and legacy schedule behavior.
- `tests/salarySavings.test.js`: financial-year filtering, summaries, investment funding links, backup validation, salary API validation, and investment dependency checks.
- `tests/securityMiddleware.test.js`: health privacy, production origin checks, strict schema rejection, auth rate limiting, and startup guardrails.

Recommended future coverage:

- auth login/session lifecycle with mocked Google verification,
- owner vs shared read-only permissions,
- investment create/update/archive dependency graph,
- hard delete funding-link cleanup,
- master rename propagation,
- import dry-run and commit transactions,
- backup preview/restore rollback behavior,
- frontend smoke tests for main mobile workflows.

## 13. Known Trade-Offs and Maintenance Notes

1. `src/App.jsx` is a large state and orchestration file. Future work should extract dashboard calculations, session handling, API hooks, and portfolio state into smaller modules as behavior stabilizes.

2. `server/index.js` currently contains models, middleware, schemas, helpers, and routes in one file. This makes tracing easy but increases maintenance pressure. Good extraction candidates are auth, audit, deposits, master data, import, backup, sharing, and security middleware.

3. The investment schema is flexible by design. The real contract is the Zod write schema plus shared normalization helpers. Any new persisted field should be added to validation, backup, import/export if applicable, and tests.

4. Interest/tax outputs are estimates and should be presented as such. Exact tax treatment can vary by product, owner, and jurisdictional changes.

5. Some UI strings currently contain mojibake/encoding artifacts such as `â€¢`. This should be fixed in a focused text cleanup pass so UI copy and docs remain readable.

## 14. Suggested Documentation Derivatives

This document can later be split into:

- API reference with request/response examples,
- data dictionary for investment/master/share/session/audit records,
- security runbook and deployment checklist,
- backup/restore operations playbook,
- import workbook guide for users,
- domain rules manual for payout, maturity, allocation, and tax assumptions,
- QA test plan for manual and automated coverage.

## 15. Next-Step Recommendations

- Modularize backend route groups and middleware.
- Extract frontend portfolio/session/dashboard hooks from `App.jsx`.
- Add endpoint-level API documentation aligned with Zod schemas.
- Add integration tests for auth, sharing, import, backup, and archive/delete safety.
- Add audit retention cleanup and high-risk admin alerting.
- Introduce first-class persisted cash-flow events if reporting needs outgrow computed events.
