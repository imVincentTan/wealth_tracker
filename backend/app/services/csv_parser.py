import csv
import hashlib
import io
import re
from datetime import date, datetime
from typing import Any

from app.models import TransactionType

TRANSFER_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bzelle\b",
        r"\batm\b",
        r"cash wr?ithdraw",
        r"payment\s*[-–]?\s*thank you",
        r"thank you.*payment",
        r"\bautopay\b",
        r"automatic payment",
        r"credit card payment",
        r"payment received",
        r"online banking transfer",
        r"e-?transfer",
        r"\binterac\b",
        r"transfer to\b",
        r"transfer from\b",
        r"bill pay(ment)?",
        r"^payment$",
        r"mobile payment",
        r"card payment",
    )
]

TRANSFER_TYPE_VALUES = {
    "payment",
    "pmt",
    "transfer",
    "xfer",
    "ach_debit",
    "ach_credit",
}


def _parse_date(value: str, fmt: str) -> date:
    value = value.strip()
    for pattern in (fmt, "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y"):
        if not pattern:
            continue
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {value}")


def _to_float(value: str) -> float:
    cleaned = value.strip().replace(",", "").replace("$", "").replace("CAD", "").replace("USD", "")
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


def is_transfer_description(description: str) -> bool:
    text = description.strip()
    return any(pattern.search(text) for pattern in TRANSFER_PATTERNS)


def is_transfer_row(description: str, row: dict[str, str], config: dict[str, Any]) -> bool:
    type_col = config.get("type_column")
    if type_col:
        raw_type = (row.get(type_col) or "").strip().lower()
        if raw_type in TRANSFER_TYPE_VALUES:
            return True
    return is_transfer_description(description)


def merchant_key(description: str) -> str:
    text = re.sub(r"\s+", " ", description).strip()
    text = re.sub(r"\s+\d{4,}.*$", "", text)
    text = re.sub(r"\s+#\w+.*$", "", text)
    return text[:80] or description.strip()[:80]


def make_dedup_hash(account_id: int, txn_date: date, amount: float, description: str) -> str:
    payload = f"{account_id}|{txn_date.isoformat()}|{amount:.2f}|{description.strip().lower()}"
    return hashlib.sha256(payload.encode()).hexdigest()


def iter_csv_rows(content: str) -> tuple[list[str], list[tuple[int, dict[str, str]]]]:
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError("CSV has no headers")
    headers = [h for h in reader.fieldnames if h is not None]
    rows: list[tuple[int, dict[str, str]]] = []
    for row_number, row in enumerate(reader, start=2):
        rows.append((row_number, {k: (v if v is not None else "") for k, v in row.items() if k}))
    return headers, rows


def parse_csv_rows(
    content: str,
    config: dict[str, Any],
    account_id: int,
    currency: str = "CAD",
) -> list[dict[str, Any]]:
    headers, rows = iter_csv_rows(content)
    date_col = config.get("date_column")
    desc_col = config.get("description_column")
    if date_col not in headers or desc_col not in headers:
        raise ValueError(f"Expected columns {date_col!r} and {desc_col!r}; got {headers}")

    results: list[dict[str, Any]] = []
    for row_number, row in rows:
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

        amount_cad = amount  # FX hook for later
        if is_transfer_row(description, row, config):
            txn_type = TransactionType.TRANSFER
        elif amount > 0:
            txn_type = TransactionType.INCOME
        else:
            txn_type = TransactionType.EXPENSE

        results.append(
            {
                "row_number": row_number,
                "raw_data": dict(row),
                "transaction_date": txn_date,
                "amount": amount,
                "currency": currency,
                "amount_cad": amount_cad,
                "description": description,
                "merchant": merchant_key(description),
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
