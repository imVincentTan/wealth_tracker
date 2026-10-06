"""Last-import debug trace is persisted locally and returned on preview/commit."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import Base, engine
from app.main import app
from app.services.import_trace import last_trace_path

CSV_MIXED = (
    "Date,Description,Amount\n"
    "26 Sep 2026,AMEX STORE,-12.34\n"
    "09/15/2026,COFFEE,-4.50\n"
)
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


def test_commit_trace_counts_unrecognized_dates(client):
    path = last_trace_path()
    if path.exists():
        path.unlink()

    res = client.get("/api/imports/last-trace")
    assert res.status_code == 404

    created = client.post(
        "/api/accounts",
        json={
            "name": "Amex Card",
            "institution": "amex",
            "account_type": "credit_card",
            "parser_config": PARSER_CONFIG,
        },
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]

    preview = client.post(
        "/api/imports/preview",
        data={"account_id": str(account_id), "client_preview_row_count": "2"},
        files={"file": ("amex.csv", CSV_MIXED, "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert len(body["transactions"]) == 1
    trace = body["import_trace"]
    assert trace["parsed_row_count"] == 1
    assert trace["skip_counts"]["unrecognized_date"] == 1
    assert trace["client_preview_row_count"] == 2
    assert trace["preview"]["status"] == 200
    assert any(s["raw_date"] == "26 Sep 2026" for s in trace["skip_samples"])

    commit = client.post(f"/api/imports/{body['import_id']}/commit")
    assert commit.status_code == 200, commit.text
    committed = commit.json()
    assert committed["committed_count"] == 1
    commit_trace = committed["import_trace"]
    assert commit_trace["commit"]["status"] == 200
    assert commit_trace["commit"]["committed_count"] == 1
    assert commit_trace["preview"]["status"] == 200
    assert commit_trace["skip_counts"]["unrecognized_date"] == 1
    assert commit_trace["client_preview_row_count"] == 2

    stored = client.get("/api/imports/last-trace")
    assert stored.status_code == 200
    assert stored.json()["filename"] == "amex.csv"
    assert last_trace_path() == Path(settings.data_dir) / "last_import_trace.json"
    assert last_trace_path().is_file()
