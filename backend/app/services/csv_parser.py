import csv
import hashlib
import io
import re
from datetime import date, datetime
from typing import Any

from app.models import TransactionType


def _parse_date(value: str, fmt: str) -> date:
    value = value.strip()
    for pattern in (fmt, "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        if not pattern:
            continue
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {value}")


def _to_float(value: str) -> float:
    cleaned = value.strip().replace(",", "").replace("$", "")
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = f"-{cleaned[1:-1]}"
    return float(cleaned or 0)


def _amount_from_row(row: dict[str, str], config: dict[str, Any]) -> float:
    mode = config.get("amount_mode", "signed")
    if mode == "debit_credit":
        debit = _to_float(row.get(config.get("debit_column", ""), "") or "0")
        credit = _to_float(row.get(config.get("credit_column", ""), "") or "0")
        amount = credit - debit
    else:
        amount = _to_float(row.get(config.get("amount_column", ""), "0"))

    if config.get("invert_sign"):
        amount *= -1
    return amount


def make_dedup_hash(account_id: int, txn_date: date, amount: float, description: str) -> str:
    payload = f"{account_id}|{txn_date.isoformat()}|{amount:.2f}|{description.strip().lower()}"
    return hashlib.sha256(payload.encode()).hexdigest()


def parse_csv_rows(
    content: str,
    config: dict[str, Any],
    account_id: int,
    currency: str = "CAD",
) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError("CSV has no headers")

    date_col = config.get("date_column")
    desc_col = config.get("description_column")
    if date_col not in reader.fieldnames or desc_col not in reader.fieldnames:
        raise ValueError(
            f"Expected columns {date_col!r} and {desc_col!r}; got {reader.fieldnames}"
        )

    results: list[dict[str, Any]] = []
    for row_number, row in enumerate(reader, start=2):
        description = (row.get(desc_col) or "").strip()
        if not description:
            continue

        try:
            txn_date = _parse_date(row.get(date_col, ""), config.get("date_format", "%Y-%m-%d"))
            amount = _amount_from_row(row, config)
        except (ValueError, TypeError):
            continue

        if amount == 0:
            continue

        amount_cad = amount if currency == "CAD" else amount  # FX hook for later
        txn_type = (
            TransactionType.INCOME
            if amount > 0
            else TransactionType.EXPENSE
        )

        results.append(
            {
                "row_number": row_number,
                "raw_data": dict(row),
                "transaction_date": txn_date,
                "amount": amount,
                "currency": currency,
                "amount_cad": amount_cad,
                "description": description,
                "transaction_type": txn_type,
                "dedup_hash": make_dedup_hash(account_id, txn_date, amount, description),
            }
        )
    return results


def apply_category_rules(description: str, rules: list[tuple[str, str, bool]]) -> str | None:
    for pattern, category_name, is_regex in rules:
        if is_regex:
            if re.search(pattern, description, re.IGNORECASE):
                return category_name
        elif pattern.lower() in description.lower():
            return category_name
    return None
