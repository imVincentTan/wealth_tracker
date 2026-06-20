# Wealth Tracker — Project Plan

Personal finance tracker: upload bank and credit card CSV statements, store them in Postgres, and surface income, expenses, categories, and other useful financial views.

---

## Goals

- Dump credit card and bank account statements (CSV) into the system
- See **income**, **expenses**, and **expense categories** over time
- Support other useful financial summaries (monthly cash flow, category breakdowns, etc.)
- Keep raw import data in the database for re-parsing and auditability

---

## Architecture (high level)

| Layer | Choice |
|---|---|
| **App** | Local web app (browser UI, runs on your machine) |
| **Database** | PostgreSQL |
| **Backend** | Python + FastAPI |
| **Frontend** | Simple web UI (React or lightweight equivalent) |
| **Deployment** | Docker Compose (Postgres + API + frontend) |
| **Users** | Single user, no auth for v1 |

---

## Data ingestion

### Format

- **CSV only** (no PDF/OCR in v1)
- One parser profile per **saved account** (institution + account type)

### Supported institutions (v1)

| Institution | Account types |
|---|---|
| **TD** | Chequing / savings, credit card |
| **Amex** | Credit card |

> **Phase 2 (later):** NBF and Wealthsimple investment statements.

### Upload flow

**First upload for a new account:**

1. Upload CSV file
2. Select institution + account type (e.g. TD → Chequing), or create a new account
3. Map CSV columns if the parser template doesn’t match (date, amount, description, etc.)
4. Preview parsed rows → confirm import

**Subsequent uploads:**

1. Upload CSV
2. Select saved account from dropdown (e.g. “TD Chequing”, “Amex Gold”)
3. Parser runs automatically → preview → import

The system stores a **parser profile** per account (institution, type, column mapping, debit/credit sign rules). TD chequing and TD credit card are separate profiles even though both are TD.

### Import safeguards

- Store **raw CSV rows** (or full file reference) alongside normalized transactions
- **Deduplication** on re-import so the same statement doesn’t double-count
- Preview step before committing an import

---

## Normalized transaction schema (conceptual)

| Field | Notes |
|---|---|
| `date` | Transaction or posting date |
| `amount` | Native currency amount |
| `currency` | ISO code (e.g. CAD, USD) |
| `amount_cad` | Converted amount for reporting |
| `description` | Merchant / memo from statement |
| `account_id` | Which saved account this came from |
| `category` | Assigned category (see below) |
| `type` | income, expense, transfer (derived or explicit) |

---

## Categories

**Approach:** Structured default list + ability to add custom categories + rule-based auto-assignment (not pure freeform tags).

| Layer | Behaviour |
|---|---|
| **Default categories** | Groceries, Dining, Transport, Housing, Transfer, Income, etc. — user-editable |
| **Rules engine (v1)** | String/regex match on description → category (e.g. `COSTCO` → Groceries, `PAYROLL` → Income) |
| **Manual override** | Edit any transaction; optionally save as a new rule |
| **AI categorization** | Deferred — optional later for uncategorized rows only |

### Transfers

- Transfers are a **category** (e.g. “Transfer”)
- A debit in one account and credit in another naturally offset in net views
- Charts and breakdowns support **“Exclude categories”** (Transfer excluded by default on expense pie charts)
- Credit card payments from chequing are treated the same way

---

## Currency

- **Base reporting currency:** CAD (Canadian dollar)
- **Multi-currency support:** store original amount + currency on each transaction
- Convert to CAD at transaction date for dashboards and totals
- Exchange rates via a daily rate source (e.g. Bank of Canada or similar API), with manual override if needed

---

## Core features by phase

### Phase 1 — Bank & credit card (v1)

- [ ] Docker Compose setup (Postgres, API, frontend)
- [ ] Account management (create/list saved accounts)
- [ ] CSV upload with institution parsers (TD bank, TD CC, Amex CC)
- [ ] Column mapping UI for unknown CSV layouts
- [ ] Transaction list with search and filters
- [ ] Manual category edit + category rules (string matching)
- [ ] Dashboard:
  - Income vs expenses by month
  - Expense breakdown by category
  - Exclude selected categories from charts (Transfer, etc.)
- [ ] Import history and deduplication

### Phase 2 — Investments (later)

- [ ] NBF and Wealthsimple CSV parsers
- [ ] Investment transaction types (deposits, withdrawals, dividends, buys/sells)
- [ ] Account balances over time
- [ ] Net worth view (bank + CC + investments)
- [ ] Full holdings / cost basis (TBD — may need separate design pass)

### Phase 3 — Nice-to-haves (future)

- [ ] AI-assisted categorization for uncategorized transactions
- [ ] Auto-detect institution from CSV headers
- [ ] PDF statement parsing
- [ ] Multi-user / auth
- [ ] Hosted deployment

---

## Open questions (for when we build)

- Exact CSV column layouts for TD bank, TD CC, and Amex (sample redacted files will help parser accuracy)
- Exchange rate API choice for CAD conversions
- Whether TD exports separate files per account or one combined export

---

## Repo status

Scaffold only at time of writing (`README.md` + this plan). Implementation starts with Phase 1.
