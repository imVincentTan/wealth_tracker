from typing import Any

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
    "chase:chequing": {
        "date_column": "Posting Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "type_column": "Details",
        "date_format": "%m/%d/%Y",
    },
    "chase:savings": {
        "date_column": "Posting Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "type_column": "Details",
        "date_format": "%m/%d/%Y",
    },
    "chase:credit_card": {
        "date_column": "Transaction Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "type_column": "Type",
        "date_format": "%m/%d/%Y",
    },
}


def get_default_parser_config(institution: str, account_type: str) -> dict[str, Any]:
    key = f"{institution}:{account_type}"
    return DEFAULT_PARSER_CONFIGS.get(key, {}).copy()
