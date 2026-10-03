"""Tests for the authoritative backend CSV parse (the commit-time source of truth)."""

import pytest

from app.services.csv_parser import parse_csv_rows


def test_signed_amount_with_header_row_1():
    content = "Date,Description,Amount\n09/15/2026,COFFEE,-4.50\n09/16/2026,REFUND,10.00\n"
    rows = parse_csv_rows(content, {}, account_id=1)
    assert len(rows) == 2
    assert rows[0]["amount"] == -4.50
    assert rows[0]["row_number"] == 2
    assert rows[1]["amount"] == 10.00


def test_headerless_synthetic_columns():
    content = (
        "09/15/2026,ANNUAL FEE,139.00,,2024.78\n"
        "09/20/2026,PAYMENT - THANK YOU,,500.00,2386.64\n"
    )
    config = {
        "header_row": 0,
        "date_column": "Column 1",
        "description_column": "Column 2",
        "amount_mode": "debit_credit",
        "debit_column": "Column 3",
        "credit_column": "Column 4",
        "date_format": "%m/%d/%Y",
    }
    rows = parse_csv_rows(content, config, account_id=1)
    assert [r["amount"] for r in rows] == [-139.00, 500.00]
    assert rows[0]["row_number"] == 1
    assert rows[0]["raw_data"]["Column 5"] == "2024.78"


def test_explicit_delimiter():
    content = "Date;Description;Amount\n09/15/2026;COFFEE;-4.50\n"
    rows = parse_csv_rows(
        content,
        {"delimiter": ";", "date_column": "Date", "description_column": "Description",
         "amount_mode": "signed", "amount_column": "Amount"},
        account_id=1,
    )
    assert rows[0]["amount"] == -4.50


def test_delimiter_sniffed_when_unset():
    content = "Date;Description;Amount\n09/15/2026;COFFEE;-4.50\n"
    rows = parse_csv_rows(
        content,
        {"date_column": "Date", "description_column": "Description",
         "amount_mode": "signed", "amount_column": "Amount"},
        account_id=1,
    )
    assert rows[0]["description"] == "COFFEE"


def test_preamble_skipped_with_header_row():
    content = "Account summary\nDate,Description,Amount\n09/15/2026,COFFEE,-4.50\n"
    rows = parse_csv_rows(
        content,
        {"header_row": 2, "date_column": "Date", "description_column": "Description",
         "amount_mode": "signed", "amount_column": "Amount"},
        account_id=1,
    )
    assert len(rows) == 1
    assert rows[0]["row_number"] == 3


def test_header_row_beyond_file_raises():
    with pytest.raises(ValueError, match="header_row"):
        parse_csv_rows("a,b,c\n", {"header_row": 5}, account_id=1)


def test_unmappable_columns_raise():
    with pytest.raises(ValueError, match="Expected columns"):
        parse_csv_rows(
            "Foo,Bar\n1,2\n",
            {"date_column": "Date", "description_column": "Description"},
            account_id=1,
        )
