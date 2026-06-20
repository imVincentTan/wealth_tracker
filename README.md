# wealth_tracker

Personal finance tracker — upload bank and credit card CSV statements, categorize transactions, and view income/expense dashboards.

See [PLAN.md](PLAN.md) for full phased roadmap.

## Quick start

```powershell
cd C:\Users\Vincent\repos\wealth_tracker
copy .env.example .env
docker compose up --build
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:8000
- **API docs:** http://localhost:8000/docs

## Phase 1 workflow

1. **Accounts** — create saved accounts (TD chequing, TD CC, Amex CC, etc.)
2. **Import** — upload CSV, preview parsed rows, commit
3. **Transactions** — review and edit categories
4. **Dashboard** — monthly income/expenses and category breakdown (Transfer excluded by default)

## Supported CSV formats (defaults)

Parser column mappings are stored per account and can be customized later. Defaults target:

| Institution | Type | Expected columns |
|-------------|------|------------------|
| TD | Chequing / Savings | Date, Description, Withdrawals, Deposits |
| TD | Credit card | Transaction Date, Description, Amount |
| Amex | Credit card | Date, Description, Amount |

If your export differs, update `parser_config` on the account (API) — column mapping UI is planned.

## Dev without Docker

**Backend:**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Postgres must be running; set DATABASE_URL in .env
uvicorn app.main:app --reload
```

**Frontend:**

```powershell
cd frontend
npm install
npm run dev
```
