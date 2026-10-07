"""Tests for the authoritative backend CSV parse (the commit-time source of truth)."""

from datetime import date

import pytest

from app.services.csv_parser import _parse_date, parse_csv_rows


def test_signed_amount_with_header_row_1():
    content = "Date,Description,Amount\n09/15/2026,COFFEE,-4.50\n09/16/2026,REFUND,10.00\n"
    rows, _stats = parse_csv_rows(content, {}, account_id=1)
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
    rows, _stats = parse_csv_rows(content, config, account_id=1)
    assert [r["amount"] for r in rows] == [-139.00, 500.00]
    assert rows[0]["row_number"] == 1
    assert rows[0]["raw_data"]["Column 5"] == "2024.78"


def test_explicit_delimiter():
    content = "Date;Description;Amount\n09/15/2026;COFFEE;-4.50\n"
    rows, _stats = parse_csv_rows(
        content,
        {"delimiter": ";", "date_column": "Date", "description_column": "Description",
         "amount_mode": "signed", "amount_column": "Amount"},
        account_id=1,
    )
    assert rows[0]["amount"] == -4.50


def test_delimiter_sniffed_when_unset():
    content = "Date;Description;Amount\n09/15/2026;COFFEE;-4.50\n"
    rows, _stats = parse_csv_rows(
        content,
        {"date_column": "Date", "description_column": "Description",
         "amount_mode": "signed", "amount_column": "Amount"},
        account_id=1,
    )
    assert rows[0]["description"] == "COFFEE"


def test_preamble_skipped_with_header_row():
    content = "Account summary\nDate,Description,Amount\n09/15/2026,COFFEE,-4.50\n"
    rows, _stats = parse_csv_rows(
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


def test_duplicate_headers_are_uniquified():
    content = "Date,Description,Amount,Amount\n09/15/2026,COFFEE,10.00,20.00\n"
    rows, _stats = parse_csv_rows(
        content,
        {
            "date_column": "Date",
            "description_column": "Description",
            "amount_mode": "signed",
            "amount_column": "Amount (2)",
            "date_format": "%m/%d/%Y",
        },
        account_id=1,
    )
    assert rows[0]["amount"] == 20.00
    assert rows[0]["raw_data"]["Amount"] == "10.00"
    assert rows[0]["raw_data"]["Amount (2)"] == "20.00"
    with pytest.raises(ValueError, match="Expected columns"):
        parse_csv_rows(
            "Foo,Bar\n1,2\n",
            {"date_column": "Date", "description_column": "Description"},
            account_id=1,
        )


def test_amex_named_month_dates_parse_with_mdy_date_format():
    """Amex CSVs use '26 Sep 2026'; the UI still sends date_format=%m/%d/%Y."""
    content = (
        "Date,Date Processed,Description,Amount,Foreign Spend Amount,Commission,"
        "Exchange Rate,Additional Information,Merchant,Address,City / Province,"
        "Postal Code,Country,Reference\n"
        "26 Sep 2026,26 Sep 2026,redacted,15.99,,,,,redacted,,,,,'redacted'\n"
    )
    config = {
        "date_column": "Date",
        "description_column": "Description",
        "amount_mode": "signed",
        "amount_column": "Amount",
        "date_format": "%m/%d/%Y",
        "header_row": 1,
    }
    rows, _stats = parse_csv_rows(content, config, account_id=1)
    assert len(rows) == 1
    assert rows[0]["transaction_date"] == date(2026, 9, 26)
    assert rows[0]["amount"] == 15.99


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("26 Sep 2026", date(2026, 9, 26)),
        ("26 September 2026", date(2026, 9, 26)),
        ("26-Sep-2026", date(2026, 9, 26)),
        ("Sep 26, 2026", date(2026, 9, 26)),
        ("09/15/2026", date(2026, 9, 15)),
        ("2026-09-15", date(2026, 9, 15)),
        ("15/09/2026", date(2026, 9, 15)),
        ("2026/09/15", date(2026, 9, 15)),
        ("09-15-2026", date(2026, 9, 15)),
    ],
)
def test_parse_date_named_and_numeric_formats(raw, expected):
    assert _parse_date(raw, "%m/%d/%Y") == expected


SIGNED = {
    "date_column": "Date",
    "description_column": "Description",
    "amount_mode": "signed",
    "amount_column": "Amount",
    "date_format": "%m/%d/%Y",
}


def test_unrecognized_date_is_counted_not_parsed():
    # Do not use Amex "26 Sep 2026" as a skip fixture — that is a real statement
    # format the backend parser also accepts. Garbage like 99/99/9999 stays invalid.
    content = (
        "Date,Description,Amount\n"
        "99/99/9999,UNKNOWN STORE,-12.34\n"
        "09/15/2026,COFFEE,-4.50\n"
    )
    rows, stats = parse_csv_rows(content, SIGNED, account_id=1)
    assert len(rows) == 1
    assert stats.parsed_row_count == 1
    assert rows[0]["description"] == "COFFEE"
    assert stats.skip_counts["unrecognized_date"] == 1
    assert stats.file_data_row_count == 2
    assert stats.csv_headers == ["Date", "Description", "Amount"]
    sample = next(s for s in stats.skip_samples if s["raw_date"] == "99/99/9999")
    assert sample["reason"] == "unrecognized_date"
    assert sample["raw_amount"] == "-12.34"
    assert sample["row_number"] == 2
    assert "UNKNOWN STORE" not in sample.values()


def test_empty_description_zero_amount_and_bad_amount_are_counted():
    content = (
        "Date,Description,Amount\n"
        "09/15/2026,,-4.50\n"
        "09/16/2026,ZERO,0.00\n"
        "09/17/2026,BAD AMOUNT,not-a-number\n"
        "not-a-date,STILL HAS DESC,-1.00\n"
        "09/18/2026,COFFEE,-4.50\n"
    )
    rows, stats = parse_csv_rows(content, SIGNED, account_id=1)
    assert [r["description"] for r in rows] == ["COFFEE"]
    assert stats.skip_counts["empty_description"] == 1
    assert stats.skip_counts["zero_amount"] == 1
    assert stats.skip_counts["other_parse_error"] == 1
    assert stats.skip_counts["unrecognized_date"] == 1
    by_reason = {s["reason"]: s for s in stats.skip_samples}
    assert by_reason["empty_description"]["row_number"] == 2
    assert by_reason["zero_amount"]["row_number"] == 3
    assert by_reason["other_parse_error"]["row_number"] == 4
    assert by_reason["unrecognized_date"]["raw_date"] == "not-a-date"
    assert by_reason["unrecognized_date"]["row_number"] == 5
    assert "BAD AMOUNT" not in by_reason["other_parse_error"].values()
