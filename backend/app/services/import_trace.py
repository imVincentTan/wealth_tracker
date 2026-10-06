"""Last-import debug trace.

A single JSON file next to the SQLite db (gitignored data dir). Overwritten
on every preview/commit so a human can paste it into a chat. Never sent
anywhere — local disk only.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.csv_parser import ParseStats

logger = logging.getLogger(__name__)

TRACE_FILENAME = "last_import_trace.json"


def last_trace_path() -> Path:
    return Path(settings.data_dir) / TRACE_FILENAME


def write_last_trace(trace: dict[str, Any]) -> None:
    path = last_trace_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(trace, indent=2, default=str) + "\n", encoding="utf-8")
    except OSError as exc:
        # Debug convenience; never fail an import over a trace write.
        logger.warning("Could not write last import trace: %s", exc)


def read_last_trace() -> dict[str, Any] | None:
    path = last_trace_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read last import trace: %s", exc)
        return None
    return data if isinstance(data, dict) else None


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_import_trace(
    *,
    account_id: int,
    account_name: str,
    filename: str,
    parser_config: dict[str, Any],
    stats: ParseStats | None = None,
    skipped_duplicates: int = 0,
    import_id: int | None = None,
    preview: dict[str, Any] | None = None,
    commit: dict[str, Any] | None = None,
    client_preview_row_count: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # skipped_duplicates is counted later at commit via dedup_hash, not during parse.
    skip_counts = {
        "unrecognized_date": 0,
        "empty_description": 0,
        "zero_amount": 0,
        "other_parse_error": 0,
        "skipped_duplicates": skipped_duplicates,
    }
    payload: dict[str, Any] = {
        "timestamp": utc_now(),
        "account_id": account_id,
        "account_name": account_name,
        "filename": filename,
        "parser_config": dict(parser_config or {}),
        "invert_sign": bool((parser_config or {}).get("invert_sign")),
    }
    if import_id is not None:
        payload["import_id"] = import_id
    if stats is not None:
        skip_counts.update(stats.skip_counts)
        skip_counts["skipped_duplicates"] = skipped_duplicates
        payload.update(
            {
                "delimiter": stats.delimiter,
                "header_row": stats.header_row,
                "csv_headers": stats.csv_headers,
                "file_data_row_count": stats.file_data_row_count,
                "parsed_row_count": stats.parsed_row_count,
                "skip_counts": skip_counts,
                "skip_samples": stats.skip_samples,
            }
        )
        # Prefer the config actually used to parse (sniffed delimiter, filled columns).
        if stats.parser_config:
            payload["parser_config"] = dict(stats.parser_config)
            payload["invert_sign"] = bool(stats.parser_config.get("invert_sign"))
            payload.setdefault("delimiter", stats.delimiter)
            payload.setdefault("header_row", stats.header_row)
    else:
        payload["skip_counts"] = skip_counts
        payload["skip_samples"] = []
    if client_preview_row_count is not None:
        payload["client_preview_row_count"] = client_preview_row_count
    if preview is not None:
        payload["preview"] = preview
    if commit is not None:
        payload["commit"] = commit
    if extra:
        payload.update(extra)
    return payload
