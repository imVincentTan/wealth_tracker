# Tally / Wealth Tracker

Upload bank and credit-card CSVs, store the original rows, and get a spending report: totals, categories, monthly trend, merchants.

This is the [wealth_tracker](https://github.com/imVincentTan/wealth_tracker) plan with Tally’s report UI on top.

Architecture, product invariants, and verify steps: [docs/project-context.md](docs/project-context.md).

## Run it (the easy way)

The whole app is **one local server**: UI, API, and database. The only prerequisite is [Python 3.10+](https://www.python.org/downloads/) — no Docker, no database server, no Node.

- **Mac**: double-click `start.command` (if macOS blocks it, right-click → Open, or run `bash start.command`)
- **Windows**: double-click `start.bat` (if SmartScreen warns, More info → Run anyway)

The script sets up a Python environment on first run, then starts the app and opens your browser at **http://127.0.0.1:8000**. Keep the window open while using the app; close it (or Ctrl+C) to stop.

Your data lives in `backend/data/tally.db` (SQLite) — it persists between runs. Delete that file to start over. API docs at http://127.0.0.1:8000/docs.

## Run it with Docker (Postgres)

If you have Docker Desktop and want the full Postgres setup:

```bash
cp .env.example .env
docker compose up --build          # Postgres + API on :8000 + UI on :43127
```

## Develop

UI development with hot reload (split servers):

```bash
docker compose up --build db api               # or your own Postgres + DATABASE_URL
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev   # UI dev server on :43127
```

Backend only, no Docker:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify changes: `npm run test`, `npm run lint`, `npm run build`, then exercise the API flow (preview → commit → dedup → dashboard) with the sample CSVs in `public/samples/`.

### Rebuild the bundled UI

The single-server path serves a prebuilt static export committed at `backend/app/static/`. After changing the UI, regenerate and commit it:

```bash
# Mac/Linux — the empty NEXT_PUBLIC_API_URL matters: it keeps API calls
# same-origin relative even if a .env from the Docker path is present.
NEXT_PUBLIC_API_URL="" TALLY_STATIC_EXPORT=1 npm run build && rm -rf backend/app/static && cp -r out backend/app/static

# Windows (cmd)
set NEXT_PUBLIC_API_URL= && set TALLY_STATIC_EXPORT=1 && npm run build && rmdir /s /q backend\app\static && xcopy /e /i /q out backend\app\static
```

## What it stores

Each import keeps:

- The original CSV text
- Every raw row as JSON
- Normalized transactions (date, amount, CAD amount, merchant, category)
- Per-account parser config (TD chequing vs TD card vs Amex vs Chase)

Re-importing the same statement is deduplicated.

## Import

TD chequing/savings (Withdrawals/Deposits), TD and Amex cards, Chase checking/card, or a generic Date / Description / Amount file. If columns are unusual, map them before commit.

CAD is the reporting currency. Transfers (card payments, Zelle, ATM cash) are stored but excluded from spending totals.
