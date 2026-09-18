from fastapi.testclient import TestClient

from app.main import app
from app.services.schema import ensure_schema
from app.database import engine, SessionLocal
from app.services.seed import seed_default_categories

ensure_schema(engine)
db = SessionLocal()
try:
    seed_default_categories(db)
finally:
    db.close()

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_sample_household_report_excludes_transfers():
    loaded = client.post("/sample-household")
    assert loaded.status_code == 200
    body = loaded.json()
    assert body["created_transactions"] > 0

    dash = client.get("/dashboard").json()
    assert dash["total_spent"] > 0
    assert dash["total_income"] > 0
    assert dash["total_net"] == round(dash["total_income"] - dash["total_spent"], 2)
    assert dash["top_merchants"]
    assert dash["by_category"]
    assert all(row["category"] != "Transfer" for row in dash["by_category"])
    assert all("ZELLE" not in row["merchant"].upper() for row in dash["top_merchants"])
    assert all("ATM" not in row["merchant"].upper() for row in dash["top_merchants"])


def test_detect_and_import_chase_csv():
    csv_body = (
        "Transaction Date,Post Date,Description,Category,Type,Amount\n"
        "09/05/2026,09/06/2026,STARBUCKS QUEEN ST,Food,Sale,-12.40\n"
        "09/12/2026,09/12/2026,AUTOPAY PAYMENT,Payment,Payment,180.00\n"
    )
    detect = client.post(
        "/imports/detect",
        files={"file": ("Chase_Sapphire.csv", csv_body, "text/csv")},
    )
    assert detect.status_code == 200
    detected = detect.json()
    assert detected["institution"] == "chase"
    assert detected["parser_config"]["amount_column"] == "Amount"

    account = client.post(
        "/accounts",
        json={
            "name": "Chase Test",
            "institution": "chase",
            "account_type": "credit_card",
            "parser_config": detected["parser_config"],
        },
    )
    assert account.status_code == 201
    account_id = account.json()["id"]

    preview = client.post(
        "/imports/preview",
        data={
            "account_id": str(account_id),
            "parser_config": __import__("json").dumps(detected["parser_config"]),
            "save_mapping": "true",
        },
        files={"file": ("Chase_Sapphire.csv", csv_body, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    payload = preview.json()
    assert payload["import_id"]
    types = {row["description"]: row["transaction_type"] for row in payload["transactions"]}
    assert types["STARBUCKS QUEEN ST"] == "expense"
    assert types["AUTOPAY PAYMENT"] == "transfer"

    commit = client.post(f"/imports/{payload['import_id']}/commit")
    assert commit.status_code == 200
    assert commit.json()["committed_count"] == 2

    txns = client.get("/transactions", params={"account_id": account_id}).json()
    assert len(txns) == 2


def test_recategorize_merchant_saves_rule():
    client.post("/sample-household")
    cats = {c["name"]: c["id"] for c in client.get("/categories").json()}
    result = client.post(
        "/transactions/recategorize-merchant",
        json={"pattern": "STARBUCKS", "category": "Dining", "save_rule": True},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["updated_count"] >= 1
    assert body["rule_id"]
    rules = client.get("/categories/rules").json()
    assert any(rule["pattern"] == "STARBUCKS" and rule["category_id"] == cats["Dining"] for rule in rules)
