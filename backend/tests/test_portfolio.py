"""Accounts list, import balance snapshots, holdings, and net worth."""

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app
from app.services.csv_parser import extract_latest_balance

PARSER_CONFIG = {
    "date_column": "Date",
    "description_column": "Description",
    "amount_mode": "signed",
    "amount_column": "Amount",
    "balance_column": "Balance",
    "date_format": "%m/%d/%Y",
}

CSV_BANK = (
    "Date,Description,Amount,Balance\n"
    "09/01/2026,PAYROLL,3200.00,5000.00\n"
    "09/10/2026,RENT,-1800.00,3200.00\n"
    "09/15/2026,COFFEE,-4.50,3195.50\n"
)

CSV_BANK_LATER = (
    "Date,Description,Amount,Balance\n"
    "10/01/2026,PAYROLL,3200.00,6400.00\n"
)


def _client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestClient(app)


def test_extract_latest_balance_uses_newest_date_not_file_order():
    csv = (
        "Date,Description,Amount,Balance\n"
        "09/15/2026,PAYROLL,100,9000.00\n"
        "09/01/2026,RENT,-50,100.00\n"
    )
    as_of, amount = extract_latest_balance(csv, PARSER_CONFIG)
    assert as_of.isoformat() == "2026-09-15"
    assert amount == 9000.00


def test_create_spending_account_appears_on_portfolio_list():
    with _client() as client:
        res = client.post(
            "/api/accounts",
            json={
                "name": "TD Chequing",
                "institution": "td",
                "account_type": "chequing",
                "parser_config": PARSER_CONFIG,
            },
        )
        assert res.status_code == 201, res.text
        spending_id = res.json()["id"]
        listed = client.get("/api/portfolio").json()
        match = next(a for a in listed["accounts"] if a["name"] == "TD Chequing")
        assert match["kind"] == "chequing"
        assert match["spending_account_id"] == spending_id
        assert match["side"] == "asset"
        assert match["current_value"] == 0


def test_import_snapshots_latest_balance_and_newer_file_wins():
    with _client() as client:
        account_id = client.post(
            "/api/accounts",
            json={
                "name": "TD Chequing",
                "institution": "td",
                "account_type": "chequing",
                "parser_config": PARSER_CONFIG,
            },
        ).json()["id"]
        preview = client.post(
            "/api/imports/preview",
            data={"account_id": str(account_id)},
            files={"file": ("sep.csv", CSV_BANK, "text/csv")},
        )
        assert preview.status_code == 200, preview.text
        commit = client.post(f"/api/imports/{preview.json()['import_id']}/commit")
        assert commit.status_code == 200, commit.text

        listed = client.get("/api/portfolio").json()
        row = next(a for a in listed["accounts"] if a["name"] == "TD Chequing")
        assert row["balance"] == 3195.50
        assert row["balance_as_of"] == "2026-09-15"
        assert row["current_value"] == 3195.50
        assert listed["assets_total"] == 3195.50
        assert listed["net"] == 3195.50

        preview2 = client.post(
            "/api/imports/preview",
            data={"account_id": str(account_id)},
            files={"file": ("oct.csv", CSV_BANK_LATER, "text/csv")},
        )
        client.post(f"/api/imports/{preview2.json()['import_id']}/commit")
        listed = client.get("/api/portfolio").json()
        row = next(a for a in listed["accounts"] if a["name"] == "TD Chequing")
        assert row["balance"] == 6400.00
        assert row["balance_as_of"] == "2026-10-01"


def test_credit_card_is_debt_and_manual_balance_updates():
    with _client() as client:
        created = client.post(
            "/api/portfolio",
            json={"name": "Amex Gold", "kind": "credit_card", "institution": "amex", "balance": 612.40},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["side"] == "debt"
        assert body["balance"] == 612.40
        assert body["spending_account_id"] is not None
        listed = client.get("/api/portfolio").json()
        assert listed["debts_total"] == 612.40
        assert listed["net"] == -612.40

        patched = client.patch(f"/api/portfolio/{body['id']}", json={"balance": 200})
        assert patched.status_code == 200, patched.text
        assert patched.json()["balance"] == 200
        listed = client.get("/api/portfolio").json()
        assert listed["debts_total"] == 200


def test_investment_holdings_and_property_mortgage_net_worth():
    with _client() as client:
        tfsa = client.post("/api/portfolio", json={"name": "TFSA", "kind": "tfsa"}).json()
        holding = client.post(
            f"/api/portfolio/{tfsa['id']}/holdings",
            json={"name": "VCN", "quantity": 10, "price_cad": 50},
        )
        assert holding.status_code == 201, holding.text
        assert holding.json()["current_value"] == 500
        cash = client.post(
            f"/api/portfolio/{tfsa['id']}/holdings",
            json={"name": "CAD cash", "quantity": 1, "price_cad": 250},
        )
        assert cash.json()["current_value"] == 750

        house = client.post(
            "/api/portfolio",
            json={
                "name": "Home",
                "kind": "property",
                "purchase_date": "2019-06-01",
                "purchase_price": 800000,
            },
        )
        assert house.status_code == 201, house.text
        mortgage = client.post(
            "/api/portfolio",
            json={
                "name": "Home mortgage",
                "kind": "mortgage",
                "balance": 500000,
                "linked_property_id": house.json()["id"],
            },
        )
        assert mortgage.status_code == 201, mortgage.text
        assert mortgage.json()["linked_property_name"] == "Home"
        assert mortgage.json()["side"] == "debt"

        listed = client.get("/api/portfolio").json()
        assert listed["assets_total"] == 800750
        assert listed["debts_total"] == 500000
        assert listed["net"] == 300750
