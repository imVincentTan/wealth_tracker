# Tally / Wealth Tracker

Upload bank and credit-card CSVs, store the original rows in Postgres, and get a spending report: totals, categories, monthly trend, merchants.

This is the [wealth_tracker](https://github.com/imVincentTan/wealth_tracker) plan with Tally’s report UI on top.

## Run it (the easy way)

The only prerequisite is [Docker Desktop](https://www.docker.com/products/docker-desktop/) — installed and running.

- **Mac**: double-click `start.command` (if macOS blocks it, right-click → Open, or run `bash start.command`)
- **Windows**: double-click `start.bat` (if SmartScreen warns, More info → Run anyway)

The script starts Postgres, the API, and the UI, and opens the app in your browser when it's ready. First run takes a few minutes to download and build. Keep the window open while using the app; close it (or Ctrl+C) to stop. Your data persists between runs.

- App: http://127.0.0.1:43127
- API docs: http://127.0.0.1:8000/docs

## Run it (manual / development)

```bash
cp .env.example .env
docker compose up --build          # Postgres + API + UI
```

For UI development with hot reload, run the UI outside Docker instead:

```bash
docker compose up --build db api   # backend only
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev
```

Without Docker, run Postgres yourself, set `DATABASE_URL`, then:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
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
