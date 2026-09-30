---
type: Project Context
title: wealth_tracker / Tally
description: Architecture, product invariants, and run/verify steps for the Tally report UI on FastAPI + Postgres. Entry point for agents and contributors working on this repo.
tags: [finance, csv, postgres, fastapi, nextjs]
timestamp: 2026-09-30T00:00:00Z
status: active
---

# Summary

Personal finance tracker. Upload CSV statements from bank and credit card accounts into Postgres; view income, expenses, categories, and cash-flow dashboards in the Next.js "Tally" report UI.

# Architecture

- **Frontend**: Next.js app at the repo root (`src/app`, `src/components`, `src/lib`). Key files: `src/lib/api.ts` (backend calls), `src/lib/store.ts` (zustand + import flow), `src/lib/reports.ts` (`buildReport`), `src/components/tally-app.tsx`, `import-dialog.tsx`, `transaction-table.tsx`, charts in `category-chart.tsx` + `trend-chart.tsx`.
- **Backend**: FastAPI in `backend/app/` — `models.py` (Account, Category, CategoryRule, Import(+`raw_csv`), RawImportRow, Transaction(+`merchant`)), `routers/` (accounts, categories, imports, transactions, dashboard), `services/csv_parser.py` (`parse_csv_rows`, `extract_merchant`, `detect_parser_config`), `services/seed.py` (default categories + rules), `parsers/defaults.py` (TD/Amex/Chase).
- **DB**: Postgres 16. Tables are created via `Base.metadata.create_all` on startup — **there are no migrations**; if the schema drifts in a dev environment, recreate the database.
- The UI talks to `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). The UI dev port is **43127** (not 3000). API docs at `http://127.0.0.1:8000/docs`.

# Product invariants (preserve these)

- Store the original CSV text (`Import.raw_csv`) and every raw row as JSON (`RawImportRow.raw_data`).
- Imports are preview-then-commit; re-importing the same statement is deduplicated via `dedup_hash`.
- Saved accounts carry `parser_config` (institution + account type + column mapping).
- Parsers: TD chequing/savings (Withdrawals/Deposits), TD card, Amex, Chase, plus a generic Date/Description/Amount detector with column mapping.
- Transfers (card payments, Zelle, ATM cash) are stored but **excluded** from spending totals.
- CAD is the reporting currency.
- Recategorize optionally applies to the merchant (creates a `CategoryRule`). User-created rules must take precedence over seeded defaults — rules are loaded newest-first in `backend/app/routers/imports.py`; keep it that way.

# Run

```bash
cp .env.example .env
docker compose up --build                                # Postgres + FastAPI (api on :8000)
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev    # UI on :43127
```

Without Docker: run Postgres yourself, set `DATABASE_URL`, then `cd backend && python -m venv .venv && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000`.

# Verify

- `npm run test` — ledger/report unit tests
- `npm run lint` — eslint
- `npm run build` — production build
- End-to-end through the API: create account → `/imports/preview` → `/imports/{id}/commit` → re-import (dedup) → `/dashboard` totals. Sample CSVs in `public/samples/` (chase-checking.csv, chase-credit.csv).

# Deferred (Phase 2)

- Investment statements: NBF, Wealthsimple
- Net worth including investment balances
