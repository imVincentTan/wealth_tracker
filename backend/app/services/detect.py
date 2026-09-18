from typing import Any

from app.models import AccountType, Institution
from app.parsers.defaults import GENERIC_SIGNED, get_default_parser_config


DATE_CANDIDATES = [
    "Transaction Date",
    "Trans Date",
    "Posting Date",
    "Post Date",
    "Posted Date",
    "Date",
]
DESCRIPTION_CANDIDATES = [
    "Description",
    "Merchant",
    "Name",
    "Memo",
    "Details",
    "Transaction Description",
]
AMOUNT_CANDIDATES = ["Amount", "CAD", "Transaction Amount", "Amt"]
DEBIT_CANDIDATES = ["Withdrawals", "Withdrawal", "Debit", "Debit Amount"]
CREDIT_CANDIDATES = ["Deposits", "Deposit", "Credit", "Credit Amount"]
TYPE_CANDIDATES = ["Type", "Transaction Type"]


def _lower_map(headers: list[str]) -> dict[str, str]:
    return {h.strip().lower(): h for h in headers if h and h.strip()}


def pick_header(headers: list[str], candidates: list[str]) -> str | None:
    lookup = _lower_map(headers)
    for candidate in candidates:
        if candidate.lower() in lookup:
            return lookup[candidate.lower()]
    return None


def suggested_mapping(headers: list[str]) -> dict[str, Any]:
    debit = pick_header(headers, DEBIT_CANDIDATES)
    credit = pick_header(headers, CREDIT_CANDIDATES)
    mapping: dict[str, Any] = {
        "date_column": pick_header(headers, DATE_CANDIDATES) or (headers[0] if headers else "Date"),
        "description_column": pick_header(headers, DESCRIPTION_CANDIDATES)
        or (headers[1] if len(headers) > 1 else "Description"),
        "amount_column": pick_header(headers, AMOUNT_CANDIDATES),
        "debit_column": debit,
        "credit_column": credit,
        "type_column": pick_header(headers, TYPE_CANDIDATES),
        "date_format": "%m/%d/%Y",
        "invert_sign": False,
    }
    if debit and credit:
        mapping["amount_mode"] = "debit_credit"
        mapping.pop("amount_column", None)
    else:
        mapping["amount_mode"] = "signed"
        if not mapping["amount_column"]:
            mapping["amount_column"] = pick_header(headers, AMOUNT_CANDIDATES) or "Amount"
    return {k: v for k, v in mapping.items() if v is not None}


def detect_parser(headers: list[str], filename: str = "") -> dict[str, Any]:
    lookup = {h.strip().lower() for h in headers if h}
    name = (filename or "").lower()
    mapping = suggested_mapping(headers)

    institution: Institution | None = None
    account_type: AccountType | None = None
    confidence = "low"
    notes = "Generic Date / Description / Amount mapping. Confirm columns before import."

    chase_headers = {"post date", "transaction date"} <= lookup or (
        "chase" in name
    ) or ({"transaction date", "post date", "description", "type", "amount"} <= lookup)

    if {"withdrawals", "deposits"} <= lookup and "date" in lookup:
        institution = Institution.TD
        account_type = AccountType.SAVINGS if "saving" in name else AccountType.CHEQUING
        confidence = "high"
        notes = "TD chequing/savings export (Withdrawals / Deposits)."
        mapping = get_default_parser_config("td", account_type.value)
        mapping["date_column"] = pick_header(headers, ["Date"]) or mapping["date_column"]
        mapping["description_column"] = (
            pick_header(headers, ["Description"]) or mapping["description_column"]
        )
    elif chase_headers:
        institution = Institution.CHASE
        account_type = (
            AccountType.CHEQUING if "checking" in name or "chequing" in name else AccountType.CREDIT_CARD
        )
        confidence = "high" if "chase" in name or "post date" in lookup else "medium"
        notes = "Chase export detected. Purchases are negative; payments are excluded as transfers."
        mapping = get_default_parser_config("chase", account_type.value)
        mapping.update({k: v for k, v in suggested_mapping(headers).items() if v})
        mapping["invert_sign"] = False
    elif "amex" in name or "american express" in name:
        institution = Institution.AMEX
        account_type = AccountType.CREDIT_CARD
        confidence = "high"
        notes = "American Express credit card export."
        mapping = get_default_parser_config("amex", "credit_card")
        mapping.update({k: v for k, v in suggested_mapping(headers).items() if v})
        mapping["invert_sign"] = True
    elif {"transaction date", "description", "amount"} <= lookup:
        institution = Institution.TD
        account_type = AccountType.CREDIT_CARD
        confidence = "medium"
        notes = "Looks like a TD credit-card export (Transaction Date / Amount). Charges are inverted."
        mapping = get_default_parser_config("td", "credit_card")
        mapping.update({k: v for k, v in suggested_mapping(headers).items() if v})
        mapping["invert_sign"] = True
    elif {"date", "description", "amount"} <= lookup:
        institution = Institution.OTHER
        account_type = AccountType.CHEQUING
        confidence = "medium"
        notes = "Generic Date / Description / Amount CSV."
        mapping = GENERIC_SIGNED.copy()
        mapping.update(suggested_mapping(headers))
        mapping["invert_sign"] = False
    else:
        institution = Institution.OTHER
        account_type = AccountType.CHEQUING
        mapping.setdefault("invert_sign", False)

    return {
        "institution": institution,
        "account_type": account_type,
        "parser_config": mapping,
        "confidence": confidence,
        "notes": notes,
    }
