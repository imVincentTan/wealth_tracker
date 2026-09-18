# Tally / wealth_tracker

Local personal-finance app: upload bank and credit-card CSVs, store them in Postgres, and report spending in CAD.

The product UI is **Tally** (Next.js + Tailwind + shadcn-style components). The ledger is FastAPI + Postgres — not the browser.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- **Tally UI:** http://localhost:3847
- **API:** http://localhost:8000
- **API docs:** http://localhost:8000/docs
- **Postgres:** localhost:5432

Transfers (card payments, Zelle, ATM cash, Interac) are stored but excluded from spent / income / net, the category pie, monthly bars, and top merchants.

## Workflow

1. Open Tally. If the ledger is empty, import a CSV or click **Load sample household**.
2. CSV import auto-detects **Chase** and generic **Date / Description / Amount** files, plus TD chequing/savings (Withdrawals/Deposits), TD credit card, and Amex. Use the column mapper when headers differ.
3. Preview parsed rows, then commit. Dedup hashes prevent double-counting. The original CSV text and raw JSON rows are saved on the import.
4. Recategorize a merchant in the table to update matching transactions and save a category rule.

## Supported defaults

| Institution | Type | Expected columns |
|-------------|------|------------------|
| TD | Chequing / Savings | Date, Description, Withdrawals, Deposits |
| TD | Credit card | Transaction Date, Description, Amount (purchases positive; signs inverted) |
| Amex | Credit card | Date, Description, Amount |
| Chase | Credit card / chequing | Transaction Date, Description, Amount (purchases negative; Type=Payment is a transfer) |
| Other | any | Date, Description, Amount |

Institution enum: `td`, `amex`, `chase`, `other`.

Sample CSVs live in `samples/`.

## Dev without Docker frontend

```bash
docker compose up db api --build
cd frontend
npm install
npm run dev   # http://localhost:3847
```

Backend only:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Postgres must be running; set DATABASE_URL in .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Parser tests:

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
PYTHONPATH=. pytest -q
```
