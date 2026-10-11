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

- **Single-server mode (default/tester path)**: one `uvicorn` process serves everything at `http://127.0.0.1:8000` — the prebuilt static UI bundle (`backend/app/static/`, SPA fallback), the API under `/api`, and `/docs`. Storage defaults to SQLite at `backend/data/tally.db` when `DATABASE_URL` is unset.
- **Frontend**: Next.js app at the repo root (`src/app`, `src/components`, `src/lib`). Key files: `src/lib/api.ts` (backend calls — relative `/api` same-origin by default; `NEXT_PUBLIC_API_URL` origin only for the split dev setup), `src/lib/store.ts` (zustand + import flow), `src/lib/reports.ts` (`buildReport`), `src/components/tally-app.tsx`, `import-dialog.tsx`, `transaction-table.tsx`, charts in `category-chart.tsx` + `trend-chart.tsx`.
- **Backend**: FastAPI in `backend/app/` — `models.py` (Account, Category, CategoryRule, Import(+`raw_csv`), RawImportRow, Transaction(+`merchant`)), `routers/` (accounts, categories, imports, transactions, dashboard), `services/csv_parser.py` (`parse_csv_rows`, `extract_merchant`, `detect_parser_config`), `services/seed.py` (default categories + rules), `parsers/defaults.py` (TD/Amex/Chase).
- **DB**: SQLite by default (zero setup); Postgres 16 via `DATABASE_URL` (compose path). Tables are created via `Base.metadata.create_all` on startup — **there are no migrations**; if the schema drifts in a dev environment, recreate the database.
- **Dev split**: `make setup` then `make run` — uvicorn with `--reload` on **8000** and `next dev` on **43127** (`NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`). Docker compose runs db + api + web (UI on 43127).
- After changing the UI, regenerate the committed bundle: `NEXT_PUBLIC_API_URL="" TALLY_STATIC_EXPORT=1 npm run build && rm -rf backend/app/static && cp -r out backend/app/static`. The emptied env var keeps API calls same-origin relative (Next reads `.env` at build time).

# Privacy invariants (the owner's absolute line)

- **All data stays on the user's machine.** SQLite file at `backend/data/tally.db` (gitignored), or local Postgres. No outbound network calls at runtime — the backend has no HTTP client calls and the UI bundle self-hosts fonts and contains no trackers.
- **Localhost only.** The server binds `127.0.0.1`; compose publishes ports on `127.0.0.1` too. Never bind `0.0.0.0` for user-facing services.
- **Agents and contributors never see user data.** Work with the synthetic samples in `public/samples/`. Never commit real CSVs or `*.db` files, never paste real transaction contents into agent chats or issues. The data dir and `.env` are gitignored — keep them that way.
- **Future relaxation, at most**: an agent may be given a *description* of data (e.g. "a TD chequing export with columns X, Y"), never the numbers. Until explicitly enabled, not even that.

# Product invariants (preserve these)

- Store the original CSV text (`Import.raw_csv`) and every raw row as JSON (`RawImportRow.raw_data`).
- Imports are preview-then-commit; re-importing the same statement is deduplicated via `dedup_hash`.
- Saved accounts carry `parser_config` (institution + account type + column mapping). Each real card or bank account is one named account (e.g. "TD credit card"); later statements pick that name from the import dropdown and overlay the saved column mapping onto the new file's headers.
- Parsers: TD chequing/savings (Withdrawals/Deposits), TD card, Amex, Chase, plus a generic Date/Description/Amount detector with column mapping. Auto-detect fills the **What is each column?** table; the table is always shown so a wrong guess is editable. A Balance column is a recognized mapping role but is never used as an amount.
- Transfers (card payments, Zelle, ATM cash) are stored but **excluded** from spending totals.
- CAD is the reporting currency.
- Recategorize optionally applies to the merchant (creates a `CategoryRule`). User-created rules must take precedence over seeded defaults — rules are loaded newest-first in `backend/app/routers/imports.py`; keep it that way.

# Run

Tester path (only prerequisite: Python 3.10+): double-click `start.command` (Mac) / `start.bat` (Windows) → app at `http://127.0.0.1:8000`.

```bash
# manual equivalent
cd backend && python -m venv .venv && pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000   # serves UI + /api + /docs
```

Docker (Postgres): `cp .env.example .env && docker compose up --build` → UI on :43127, API on :8000.

# Verify

- `npm run test` — ledger/report unit tests
- `npm run lint` — eslint
- `npm run build` — production build
- End-to-end through the API: create account → `/imports/preview` → `/imports/{id}/commit` → re-import (dedup) → `/dashboard` totals. Sample CSVs in `public/samples/` (chase-checking.csv, chase-credit.csv).

# Deferred (Phase 2)

- Investment statements: NBF, Wealthsimple
- Net worth including investment balances
