import csv
import hashlib
import io
import re
from datetime import date, datetime
from typing import Any

from app.models import TransactionType


def _parse_date(value: str, fmt: str | None = None) -> date:
    value = value.strip()
    patterns = [fmt, "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y"]
    for pattern in patterns:
        if not pattern:
            continue
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {value}")


def _to_float(value: str) -> float:
    cleaned = value.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = f"-{cleaned[1:-1]}"
    if not cleaned or cleaned in {"-", "—"}:
        return 0.0
    return float(cleaned)


def _apply_type_sign(amount: float, type_value: str | None) -> float:
    if not type_value:
        return amount
    t = type_value.lower()
    debit_like = bool(re.search(r"\b(debit|withdrawal|sale|purchase|charge|fee)\b", t)) or t == "debit"
    credit_like = bool(re.search(r"\b(credit|deposit|payment|refund|return|interest)\b", t)) or t == "credit"
    if debit_like and amount > 0:
        return -amount
    if credit_like and amount < 0:
        return -amount
    return amount


def _amount_from_row(row: dict[str, str], config: dict[str, Any]) -> float:
    mode = config.get("amount_mode", "signed")
    if mode == "debit_credit":
        debit = _to_float(row.get(config.get("debit_column", ""), "") or "0")
        credit = _to_float(row.get(config.get("credit_column", ""), "") or "0")
        amount = credit - debit
    else:
        amount = _to_float(row.get(config.get("amount_column", ""), "0"))
        amount = _apply_type_sign(amount, row.get(config.get("type_column", ""), None))

    if config.get("invert_sign"):
        amount *= -1
    return round(amount, 2)


def make_dedup_hash(account_id: int, txn_date: date, amount: float, description: str) -> str:
    payload = f"{account_id}|{txn_date.isoformat()}|{amount:.2f}|{description.strip().lower()}"
    return hashlib.sha256(payload.encode()).hexdigest()


def extract_merchant(description: str) -> str:
    s = re.sub(r"\s+", " ", description).strip()
    prefixes = [
        r"^POS DEBIT\s+",
        r"^POS PURCHASE\s+",
        r"^DEBIT CARD\s+(PURCHASE\s+)?",
        r"^ACH DEBIT\s+",
        r"^ACH CREDIT\s+",
        r"^VISA\s+",
        r"^MASTERCARD\s+",
        r"^CHECKCARD\s+\d{4}\s+",
        r"^SQ\s*\*\s*",
        r"^TST\s*\*\s*",
    ]
    for prefix in prefixes:
        s = re.sub(prefix, "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+#\d+\b.*", "", s)
    s = s.strip() or description.strip()
    return s[:52].title()


def detect_parser_config(fieldnames: list[str], filename: str = "") -> dict[str, Any]:
    fields = {name.strip(): name for name in fieldnames}
    lower = {name.lower(): name for name in fieldnames}
    name = filename.lower()

    def pick(*aliases: str) -> str | None:
        for alias in aliases:
            if alias in lower:
                return lower[alias]
        return None

    config: dict[str, Any] = {
        "date_column": pick(
            "transaction date", "posting date", "posted date", "post date", "trans date", "date"
        ),
        "description_column": pick("description", "payee", "merchant", "name"),
        "amount_column": pick("amount", "transaction amount"),
        "debit_column": pick("debit", "withdrawal", "withdrawals"),
        "credit_column": pick("credit", "deposit", "deposits"),
        "type_column": pick("details", "type", "transaction type"),
        "date_format": "%m/%d/%Y",
        "invert_sign": False,
    }
    if config["debit_column"] or config["credit_column"]:
        config["amount_mode"] = "debit_credit"
    else:
        config["amount_mode"] = "signed"

    if "card member" in lower or "amex" in name:
        config["invert_sign"] = True
    if config["type_column"] == fields.get("Details") or (config["type_column"] and config["type_column"].lower() == "details"):
        pass
    return {k: v for k, v in config.items() if v not in (None, "")}


def parse_csv_rows(
    content: str,
    config: dict[str, Any],
    account_id: int,
    currency: str = "CAD",
    filename: str = "",
) -> list[dict[str, Any]]:
    cleaned = content.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(cleaned))
    if not reader.fieldnames:
        raise ValueError("CSV has no headers")

    effective = dict(config or {})
    if not effective.get("date_column") or not effective.get("description_column"):
        effective.update({k: v for k, v in detect_parser_config(list(reader.fieldnames), filename).items() if k not in effective or not effective.get(k)})

    date_col = effective.get("date_column")
    desc_col = effective.get("description_column")
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
            txn_date = _parse_date(row.get(date_col, ""), effective.get("date_format"))
            amount = _amount_from_row(row, effective)
        except (ValueError, TypeError):
            continue

        if amount == 0:
            continue

        amount_cad = amount if currency.upper() == "CAD" else amount
        txn_type = TransactionType.INCOME if amount > 0 else TransactionType.EXPENSE
        merchant = extract_merchant(description)

        results.append(
            {
                "row_number": row_number,
                "raw_data": dict(row),
                "transaction_date": txn_date,
                "amount": amount,
                "currency": currency,
                "amount_cad": amount_cad,
                "description": description,
                "merchant": merchant,
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
