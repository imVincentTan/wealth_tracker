"""Deleting an import removes ledger rows, raw rows, and the archived CSV."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Import, RawImportRow, Transaction

CSV_A = "Date,Description,Amount\n09/15/2026,COFFEE,-4.50\n09/16/2026,TEA,-3.25\n"
CSV_B = "Date,Description,Amount\n10/01/2026,GROCERIES,-12.00\n"
PARSER_CONFIG = {
    "date_column": "Date",
    "description_column": "Description",
    "amount_mode": "signed",
    "amount_column": "Amount",
    "date_format": "%m/%d/%Y",
}


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


def _account_id(client: TestClient, name: str = "Test Card") -> int:
    res = client.post(
        "/api/accounts",
        json={
            "name": name,
            "institution": "other",
            "account_type": "credit_card",
            "parser_config": PARSER_CONFIG,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _commit_csv(client: TestClient, account_id: int, filename: str, content: str) -> int:
    preview = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id)},
        files={"file": (filename, content, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    import_id = preview.json()["import_id"]
    commit = client.post(f"/api/imports/{import_id}/commit")
    assert commit.status_code == 200, commit.text
    return import_id


def test_delete_committed_import_removes_transactions_and_archive(client):
    account_id = _account_id(client)
    import_id = _commit_csv(client, account_id, "coffee.csv", CSV_A)

    listed = client.get("/api/imports").json()
    raw_file = next(r for r in listed if r["id"] == import_id)["raw_file"]
    archive_path = Path(settings.data_dir) / raw_file
    assert archive_path.is_file()
    assert len(client.get(f"/api/transactions?account_id={account_id}").json()) == 2

    res = client.delete(f"/api/imports/{import_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["import_id"] == import_id
    assert body["filename"] == "coffee.csv"
    assert body["deleted_transactions"] == 2

    listed = client.get("/api/imports").json()
    assert all(row["id"] != import_id for row in listed)
    assert client.get(f"/api/transactions?account_id={account_id}").json() == []
    assert client.get(f"/api/imports/{import_id}/raw_csv").status_code == 404
    assert not archive_path.exists()
    session = SessionLocal()
    try:
        assert session.get(Import, import_id) is None
        assert session.query(RawImportRow).filter(RawImportRow.import_id == import_id).count() == 0
        assert session.query(Transaction).filter(Transaction.import_id == import_id).count() == 0
    finally:
        session.close()


def test_delete_one_import_leaves_the_other(client):
    account_id = _account_id(client, "Keep Other")
    first = _commit_csv(client, account_id, "coffee.csv", CSV_A)
    second = _commit_csv(client, account_id, "groceries.csv", CSV_B)

    res = client.delete(f"/api/imports/{first}")
    assert res.status_code == 200
    assert res.json()["deleted_transactions"] == 2

    remaining = [row for row in client.get("/api/imports").json() if row["account_id"] == account_id]
    assert [row["id"] for row in remaining] == [second]
    txns = client.get(f"/api/transactions?account_id={account_id}").json()
    assert [t["description"] for t in txns] == ["GROCERIES"]


def test_delete_preview_import_with_no_ledger_rows(client):
    account_id = _account_id(client, "Preview Only")
    preview = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id)},
        files={"file": ("preview.csv", CSV_A, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    import_id = preview.json()["import_id"]

    res = client.delete(f"/api/imports/{import_id}")
    assert res.status_code == 200, res.text
    assert res.json()["deleted_transactions"] == 0
    listed = client.get("/api/imports").json()
    assert all(row["id"] != import_id for row in listed)


def test_reimport_after_delete_is_not_treated_as_duplicate(client):
    account_id = _account_id(client, "Reimport Card")
    import_id = _commit_csv(client, account_id, "coffee.csv", CSV_A)
    deleted = client.delete(f"/api/imports/{import_id}")
    assert deleted.status_code == 200

    again = _commit_csv(client, account_id, "coffee.csv", CSV_A)
    commit = client.get(f"/api/imports/{again}/raw_csv")
    assert commit.status_code == 200
    txns = client.get(f"/api/transactions?account_id={account_id}").json()
    assert len(txns) == 2


def test_delete_unknown_import_is_404(client):
    res = client.delete("/api/imports/99999")
    assert res.status_code == 404
