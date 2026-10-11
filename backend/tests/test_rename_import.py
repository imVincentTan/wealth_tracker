"""Renaming an import updates the display name and the archived CSV path."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.database import Base, engine
from app.services.raw_files import raw_file_relpath

CSV = "Date,Description,Amount\n09/15/2026,COFFEE,-4.50\n"
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


def _account_id(client: TestClient) -> int:
    res = client.post(
        "/api/accounts",
        json={
            "name": "Rename Card",
            "institution": "other",
            "account_type": "credit_card",
            "parser_config": PARSER_CONFIG,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _commit_csv(client: TestClient, account_id: int, filename: str) -> int:
    preview = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id)},
        files={"file": (filename, CSV, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    import_id = preview.json()["import_id"]
    commit = client.post(f"/api/imports/{import_id}/commit")
    assert commit.status_code == 200, commit.text
    return import_id


def test_rename_committed_import_moves_archive_and_download_name(client):
    account_id = _account_id(client)
    import_id = _commit_csv(client, account_id, "coffee.csv")
    old_rel = raw_file_relpath("Rename Card", import_id, "coffee.csv")
    old_path = Path(settings.data_dir) / old_rel
    assert old_path.is_file()

    res = client.patch(f"/api/imports/{import_id}", json={"filename": "Amex Sep 2026.csv"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["filename"] == "Amex Sep 2026.csv"
    new_rel = raw_file_relpath("Rename Card", import_id, "Amex Sep 2026.csv")
    assert body["raw_file"] == new_rel
    assert not old_path.exists()
    new_path = Path(settings.data_dir) / new_rel
    assert new_path.is_file()
    assert new_path.read_text(encoding="utf-8") == CSV

    listed = next(r for r in client.get("/api/imports").json() if r["id"] == import_id)
    assert listed["filename"] == "Amex Sep 2026.csv"
    assert listed["raw_file"] == new_rel

    download = client.get(f"/api/imports/{import_id}/raw_csv")
    assert download.status_code == 200
    assert download.headers["content-disposition"] == 'attachment; filename="Amex_Sep_2026.csv"'
    assert download.text == CSV


def test_rename_strips_path_components_and_rejects_blank(client):
    account_id = _account_id(client)
    import_id = _commit_csv(client, account_id, "coffee.csv")

    res = client.patch(f"/api/imports/{import_id}", json={"filename": "  ../secret/td-sept.csv  "})
    assert res.status_code == 200, res.text
    assert res.json()["filename"] == "td-sept.csv"

    blank = client.patch(f"/api/imports/{import_id}", json={"filename": "   "})
    assert blank.status_code == 400
    traversal = client.patch(f"/api/imports/{import_id}", json={"filename": "../"})
    assert traversal.status_code == 400


def test_rename_preview_import_updates_name_only(client):
    account_id = _account_id(client)
    preview = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id)},
        files={"file": ("preview.csv", CSV, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    import_id = preview.json()["import_id"]

    res = client.patch(f"/api/imports/{import_id}", json={"filename": "kept-as-preview.csv"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["filename"] == "kept-as-preview.csv"
    assert body["raw_file"] is None
    assert body["status"] == "preview"


def test_rename_unknown_import_is_404(client):
    res = client.patch("/api/imports/99999", json={"filename": "nope.csv"})
    assert res.status_code == 404
