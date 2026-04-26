# Fixed Income Tracker

Fixed Income Tracker is a mobile-first full-stack app for tracking fixed deposits, SCSS positions, bond-style instruments, maturity rollovers, and interest-led reinvestment flows.

It is designed around one practical problem: fixed-income investments do not live independently. Maturity proceeds and periodic interest receipts often become the funding source for new investments, and this app helps track that lineage cleanly.

## Highlights

- Track bank FDs, SCSS, bonds, and similar fixed-income instruments
- Capture maturity proceeds and periodic interest receipts as reusable cash sources
- Link new investments back to maturity or interest funding
- View reinvestment usage and remaining allocable cash
- Mobile-first navigation for overview, deposits, and add/edit workflows
- Express + MongoDB backend with demo-data support for local development

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
  demoDeposits.js
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

3. Set `MONGO_URI` in `.env`

4. Start the app:

```powershell
npm.cmd run dev
```

Frontend runs on Vite and proxies `/api` requests to the Express backend.

## Scripts

- `npm.cmd run dev` - run frontend and backend together
- `npm.cmd run build` - build the frontend
- `npm.cmd run lint` - run ESLint

## Architecture Notes

- The frontend is being split into feature-oriented modules so the app can scale beyond a single `App.jsx`.
- Funding references use stable event identifiers such as `maturity:<depositId>` and `interest:<depositId>:<yyyy-mm-dd>`.
- Demo data loading is intentionally non-destructive and meant only for UI exploration.

## Roadmap

- Continue extracting dashboard and shared UI primitives into dedicated modules
- Add stronger automated testing around funding and archive rules
- Introduce first-class persisted cash-flow events for richer reporting
