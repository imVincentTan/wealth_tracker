from typing import Any

GENERIC_SIGNED = {
    "date_column": "Date",
    "description_column": "Description",
    "amount_mode": "signed",
    "amount_column": "Amount",
    "date_format": "%Y-%m-%d",
    "invert_sign": False,
}

DEFAULT_PARSER_CONFIGS: dict[str, dict[str, Any]] = {
    "td:chequing": {
        "date_column": "Date",
        "description_column": "Description",
        "amount_mode": "debit_credit",
        "debit_column": "Withdrawals",
        "credit_column": "Deposits",
        "date_format": "%m/%d/%Y",
    },
    "td:savings": {
        "date_column": "Date",
        "description_column": "Description",
        "amount_mode": "debit_credit",
        "debit_column": "Withdrawals",
        "credit_column": "Deposits",
        "date_format": "%m/%d/%Y",
    },
    "td:credit_card": {
        "date_column": "Transaction Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "date_format": "%m/%d/%Y",
        "invert_sign": True,
    },
    "amex:credit_card": {
        "date_column": "Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "date_format": "%m/%d/%Y",
        "invert_sign": True,
    },
    "chase:credit_card": {
        "date_column": "Transaction Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "type_column": "Type",
        "date_format": "%m/%d/%Y",
        "invert_sign": False,
    },
    "chase:chequing": {
        "date_column": "Posting Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "type_column": "Type",
        "date_format": "%m/%d/%Y",
        "invert_sign": False,
    },
    "other:chequing": GENERIC_SIGNED.copy(),
    "other:savings": GENERIC_SIGNED.copy(),
    "other:credit_card": {
        **GENERIC_SIGNED,
        "invert_sign": True,
    },
}


def get_default_parser_config(institution: str, account_type: str) -> dict[str, Any]:
    key = f"{institution}:{account_type}"
    if key in DEFAULT_PARSER_CONFIGS:
        return DEFAULT_PARSER_CONFIGS[key].copy()
    if institution == "other":
        return GENERIC_SIGNED.copy()
    return GENERIC_SIGNED.copy()
