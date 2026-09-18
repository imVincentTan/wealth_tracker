from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, AccountType, Institution, Transaction, TransactionType
from app.parsers.defaults import get_default_parser_config
from app.schemas import SampleHouseholdResponse
from app.services.csv_parser import make_dedup_hash

router = APIRouter(tags=["sample"])

SAMPLE_ACCOUNTS = [
    {
        "name": "TD Chequing",
        "institution": Institution.TD,
        "account_type": AccountType.CHEQUING,
    },
    {
        "name": "TD Visa",
        "institution": Institution.TD,
        "account_type": AccountType.CREDIT_CARD,
    },
    {
        "name": "Amex Gold",
        "institution": Institution.AMEX,
        "account_type": AccountType.CREDIT_CARD,
    },
    {
        "name": "Chase Sapphire",
        "institution": Institution.CHASE,
        "account_type": AccountType.CREDIT_CARD,
    },
]

# amount is signed as stored (positive income, negative expense, transfers either way)
SAMPLE_TRANSACTIONS = [
    ("TD Chequing", date(2026, 3, 1), 4200.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 3, 3), -185.40, "LOBLAWS #1234 TORONTO ON", "Groceries", "expense"),
    ("TD Chequing", date(2026, 3, 8), -95.00, "PRESTO TORONTO ON", "Transport", "expense"),
    ("TD Chequing", date(2026, 3, 12), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 3, 15), -220.00, "TD VISA CARD PAYMENT", "Transfer", "transfer"),
    ("TD Chequing", date(2026, 3, 18), -80.00, "ATM WITHDRAWAL YONGE ST", "Transfer", "transfer"),
    ("TD Chequing", date(2026, 3, 22), -60.00, "ZELLE TO ALEX TAN", "Transfer", "transfer"),
    ("TD Visa", date(2026, 3, 4), -62.18, "TIM HORTONS #882", "Dining", "expense"),
    ("TD Visa", date(2026, 3, 9), -214.55, "COSTCO W545 TORONTO", "Groceries", "expense"),
    ("TD Visa", date(2026, 3, 16), 220.00, "PAYMENT - THANK YOU", "Transfer", "transfer"),
    ("Amex Gold", date(2026, 3, 6), -48.90, "STARBUCKS QUEEN ST", "Dining", "expense"),
    ("Amex Gold", date(2026, 3, 20), -89.00, "NETFLIX.COM", "Entertainment", "expense"),
    ("Chase Sapphire", date(2026, 3, 11), -156.20, "UBER EATS TORONTO", "Dining", "expense"),
    ("Chase Sapphire", date(2026, 3, 27), -42.10, "UBER TRIP", "Transport", "expense"),
    ("TD Chequing", date(2026, 4, 1), 4200.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 4, 4), -210.33, "NOFRILLS DUNDAS", "Groceries", "expense"),
    ("TD Chequing", date(2026, 4, 10), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 4, 14), -75.20, "ESSO STATION 441", "Transport", "expense"),
    ("TD Chequing", date(2026, 4, 19), -340.00, "AMEX GOLD PAYMENT", "Transfer", "transfer"),
    ("TD Visa", date(2026, 4, 7), -31.45, "STARBUCKS KING ST", "Dining", "expense"),
    ("TD Visa", date(2026, 4, 18), -128.90, "AMAZON MARKETPLACE", "Shopping", "expense"),
    ("Amex Gold", date(2026, 4, 5), -64.00, "SPOTIFY P123", "Entertainment", "expense"),
    ("Amex Gold", date(2026, 4, 22), 340.00, "PAYMENT RECEIVED — THANK YOU", "Transfer", "transfer"),
    ("Chase Sapphire", date(2026, 4, 9), -188.40, "COSTCO GAS", "Transport", "expense"),
    ("Chase Sapphire", date(2026, 4, 25), -96.75, "DOORDASH DOWNTOWN", "Dining", "expense"),
    ("TD Chequing", date(2026, 5, 1), 4350.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 5, 6), -198.12, "METRO BROADVIEW", "Groceries", "expense"),
    ("TD Chequing", date(2026, 5, 9), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 5, 17), -110.00, "HYDRO ONE UTILITIES", "Utilities", "expense"),
    ("TD Chequing", date(2026, 5, 21), -40.00, "INTERAC E-TRANSFER TO SAM", "Transfer", "transfer"),
    ("TD Visa", date(2026, 5, 3), -54.80, "TIM HORTONS #221", "Dining", "expense"),
    ("TD Visa", date(2026, 5, 15), -249.99, "AMAZON.CA", "Shopping", "expense"),
    ("Amex Gold", date(2026, 5, 12), -72.40, "UBER EATS", "Dining", "expense"),
    ("Amex Gold", date(2026, 5, 28), -18.99, "NETFLIX.COM", "Entertainment", "expense"),
    ("Chase Sapphire", date(2026, 5, 8), -133.20, "WALMART SUPERCENTER", "Groceries", "expense"),
    ("Chase Sapphire", date(2026, 5, 19), 400.00, "AUTOPAY PAYMENT", "Transfer", "transfer"),
    ("TD Chequing", date(2026, 6, 1), 4350.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 6, 5), -176.44, "LOBLAWS #1234 TORONTO ON", "Groceries", "expense"),
    ("TD Chequing", date(2026, 6, 8), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 6, 11), -88.00, "BELL CANADA UTILITIES", "Utilities", "expense"),
    ("TD Chequing", date(2026, 6, 20), -60.00, "ATM CASH WITHDRAWAL", "Transfer", "transfer"),
    ("TD Visa", date(2026, 6, 2), -46.10, "STARBUCKS QUEEN ST", "Dining", "expense"),
    ("TD Visa", date(2026, 6, 16), -310.55, "COSTCO W545 TORONTO", "Groceries", "expense"),
    ("Amex Gold", date(2026, 6, 14), -120.00, "PHARMACY HEALTH MART", "Health", "expense"),
    ("Chase Sapphire", date(2026, 6, 7), -77.80, "UBER TRIP", "Transport", "expense"),
    ("Chase Sapphire", date(2026, 6, 23), -55.25, "LYFT RIDE", "Transport", "expense"),
    ("TD Chequing", date(2026, 7, 1), 4350.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 7, 4), -204.90, "NO FRILLS QUEEN", "Groceries", "expense"),
    ("TD Chequing", date(2026, 7, 9), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 7, 18), -250.00, "TD VISA CREDIT CARD PAYMENT", "Transfer", "transfer"),
    ("TD Visa", date(2026, 7, 6), -39.20, "TIM HORTONS #882", "Dining", "expense"),
    ("TD Visa", date(2026, 7, 21), 250.00, "PAYMENT - THANK YOU", "Transfer", "transfer"),
    ("Amex Gold", date(2026, 7, 13), -84.60, "UBER EATS TORONTO", "Dining", "expense"),
    ("Chase Sapphire", date(2026, 7, 10), -199.00, "AMAZON MARKETPLACE", "Shopping", "expense"),
    ("Chase Sapphire", date(2026, 7, 27), -29.99, "SPOTIFY P123", "Entertainment", "expense"),
    ("TD Chequing", date(2026, 8, 1), 4500.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 8, 6), -221.18, "LOBLAWS #1234 TORONTO ON", "Groceries", "expense"),
    ("TD Chequing", date(2026, 8, 8), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 8, 15), -95.40, "SHELL CANADA", "Transport", "expense"),
    ("TD Chequing", date(2026, 8, 22), -70.00, "ZELLE TO ALEX TAN", "Transfer", "transfer"),
    ("TD Visa", date(2026, 8, 3), -58.75, "STARBUCKS KING ST", "Dining", "expense"),
    ("TD Visa", date(2026, 8, 19), -145.00, "UNIQLO EATON CENTRE", "Shopping", "expense"),
    ("Amex Gold", date(2026, 8, 11), -67.30, "DOORDASH DOWNTOWN", "Dining", "expense"),
    ("Amex Gold", date(2026, 8, 26), -18.99, "NETFLIX.COM", "Entertainment", "expense"),
    ("Chase Sapphire", date(2026, 8, 9), -162.40, "COSTCO W545 TORONTO", "Groceries", "expense"),
    ("Chase Sapphire", date(2026, 8, 28), 180.00, "PAYMENT THANK YOU", "Transfer", "transfer"),
    ("TD Chequing", date(2026, 9, 1), 4500.00, "ACME CORP PAYROLL", "Income", "income"),
    ("TD Chequing", date(2026, 9, 4), -190.22, "METRO BROADVIEW", "Groceries", "expense"),
    ("TD Chequing", date(2026, 9, 8), -1400.00, "RENT PAYMENT HOUSING CO", "Housing", "expense"),
    ("TD Chequing", date(2026, 9, 12), -102.15, "HYDRO ONE UTILITIES", "Utilities", "expense"),
    ("TD Visa", date(2026, 9, 5), -44.80, "TIM HORTONS #221", "Dining", "expense"),
    ("TD Visa", date(2026, 9, 14), -87.60, "UBER EATS", "Dining", "expense"),
    ("Amex Gold", date(2026, 9, 7), -52.10, "STARBUCKS QUEEN ST", "Dining", "expense"),
    ("Chase Sapphire", date(2026, 9, 10), -118.90, "AMAZON.CA", "Shopping", "expense"),
    ("Chase Sapphire", date(2026, 9, 16), -36.40, "UBER TRIP", "Transport", "expense"),
]


@router.post("/sample-household", response_model=SampleHouseholdResponse)
def load_sample_household(
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    existing_txns = db.query(Transaction).count()
    if existing_txns and not force:
        return SampleHouseholdResponse(
            created_accounts=0,
            created_transactions=0,
            already_loaded=True,
        )

    accounts_by_name = {acct.name: acct for acct in db.query(Account).all()}
    created_accounts = 0
    for spec in SAMPLE_ACCOUNTS:
        if spec["name"] in accounts_by_name:
            continue
        account = Account(
            name=spec["name"],
            institution=spec["institution"],
            account_type=spec["account_type"],
            currency="CAD",
            parser_config=get_default_parser_config(
                spec["institution"].value, spec["account_type"].value
            ),
        )
        db.add(account)
        db.flush()
        accounts_by_name[account.name] = account
        created_accounts += 1

    created_txns = 0
    existing_hashes = {row[0] for row in db.query(Transaction.dedup_hash).all()}
    for account_name, txn_date, amount, description, category, txn_type in SAMPLE_TRANSACTIONS:
        account = accounts_by_name[account_name]
        dedup = make_dedup_hash(account.id, txn_date, amount, description)
        if dedup in existing_hashes:
            continue
        db.add(
            Transaction(
                account_id=account.id,
                transaction_date=txn_date,
                amount=amount,
                currency="CAD",
                amount_cad=amount,
                description=description,
                category=category,
                transaction_type=TransactionType(txn_type),
                dedup_hash=dedup,
            )
        )
        existing_hashes.add(dedup)
        created_txns += 1

    db.commit()
    return SampleHouseholdResponse(
        created_accounts=created_accounts,
        created_transactions=created_txns,
        already_loaded=False,
    )
