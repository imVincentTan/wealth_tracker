"""Integration tests: committed imports are archived to disk and served back."""

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Account, Import, ImportStatus, RawImportRow
from app.services.raw_files import account_slug, raw_file_relpath, safe_filename

CSV_CONTENT = "Date,Description,Amount\n09/15/2026,COFFEE,-4.50\n"
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


def _account_id(client: TestClient, name: str) -> int:
    res = client.post(
        "/api/accounts",
        json={
            "name": name,
            "institution": "other",
            "account_type": "chequing",
            "parser_config": PARSER_CONFIG,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _import_csv(client: TestClient, account_id: int, filename: str) -> int:
    res = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id)},
        files={"file": (filename, CSV_CONTENT, "text/csv")},
    )
    assert res.status_code == 200, res.text
    import_id = res.json()["import_id"]
    res = client.post(f"/api/imports/{import_id}/commit")
    assert res.status_code == 200, res.text
    return import_id


def test_commit_writes_raw_file_with_slug_and_import_id(client):
    account_id = _account_id(client, "TD Chequing!")
    import_id = _import_csv(client, account_id, "My Statement.csv")

    relpath = f"raw/{account_slug('TD Chequing!')}/{import_id}-{safe_filename('My Statement.csv')}"
    assert relpath == f"raw/td-chequing/{import_id}-My_Statement.csv"
    path = Path(settings.data_dir) / relpath
    assert path.is_file()
    assert path.read_text(encoding="utf-8") == CSV_CONTENT


def test_list_imports_reports_raw_file(client):
    account_id = _account_id(client, "Amex Card")
    import_id = _import_csv(client, account_id, "amex.csv")

    res = client.get("/api/imports")
    assert res.status_code == 200
    imports = res.json()
    assert [row["id"] for row in imports] == sorted((row["id"] for row in imports), reverse=True)

    row = next(r for r in imports if r["id"] == import_id)
    assert row["filename"] == "amex.csv"
    assert row["account_id"] == account_id
    assert row["status"] == "committed"
    assert row["row_count"] == 1
    assert row["created_at"]
    assert row["raw_file"] == f"raw/amex-card/{import_id}-amex.csv"


def test_raw_csv_download_returns_original_bytes(client):
    account_id = _account_id(client, "Chase Card")
    import_id = _import_csv(client, account_id, "chase.csv")

    res = client.get(f"/api/imports/{import_id}/raw_csv")
    assert res.status_code == 200
    assert res.text == CSV_CONTENT
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["content-disposition"] == 'attachment; filename="chase.csv"'


def test_raw_csv_download_reconstructs_from_raw_rows(client):
    account_id = _account_id(client, "Recon Bank")
    session = SessionLocal()
    try:
        import_row = Import(
            account_id=account_id,
            filename="reconstructed.csv",
            status=ImportStatus.PREVIEW,
            row_count=1,
            raw_csv=None,
        )
        session.add(import_row)
        session.flush()
        session.add(
            RawImportRow(
                import_id=import_row.id,
                row_number=1,
                raw_data={"Date": "09/15/2026", "Description": "COFFEE", "Amount": "-4.50"},
            )
        )
        session.commit()
        import_id = import_row.id
    finally:
        session.close()

    res = client.get(f"/api/imports/{import_id}/raw_csv")
    assert res.status_code == 200
    assert "Date,Description,Amount" in res.text
    assert "COFFEE" in res.text
    assert res.headers["content-disposition"] == 'attachment; filename="reconstructed.csv"'


def test_archive_survives_db_reset_and_path_shape_is_deterministic(client):
    account_id = _account_id(client, "Last Bank")
    import_id = _import_csv(client, account_id, "statement.csv")

    listed = client.get("/api/imports").json()
    raw_file = next(r for r in listed if r["id"] == import_id)["raw_file"]
    archive_path = Path(settings.data_dir) / raw_file

    # Deterministic shape: raw/<account-slug>/<import-id>-<safe-filename>.
    assert raw_file == raw_file_relpath("Last Bank", import_id, "statement.csv")
    assert archive_path.parent == Path(settings.data_dir) / "raw" / "last-bank"
    assert archive_path.name.startswith(f"{import_id}-")

    # Wiping the database must leave the archive untouched.
    db_path = settings.database_url.removeprefix("sqlite:///")
    os.remove(db_path)
    assert archive_path.is_file()
    assert archive_path.read_text(encoding="utf-8") == CSV_CONTENT
