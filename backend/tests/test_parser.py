from app.services.csv_parser import is_transfer_description, parse_csv_rows
from app.models import TransactionType
from app.services.detect import detect_parser


TD_BANK = """Date,Description,Withdrawals,Deposits
03/15/2026,LOBLAWS TORONTO,85.40,
03/16/2026,ACME CORP PAYROLL,,4200.00
03/18/2026,ATM WITHDRAWAL YONGE,80.00,
03/20/2026,ZELLE TO ALEX TAN,60.00,
"""

TD_CC = """Transaction Date,Description,Amount
03/04/2026,TIM HORTONS #882,12.18
03/16/2026,PAYMENT - THANK YOU,-220.00
"""

CHASE_CC = """Transaction Date,Post Date,Description,Category,Type,Amount
03/11/2026,03/12/2026,UBER EATS TORONTO,Food,Sale,-56.20
03/19/2026,03/19/2026,AUTOPAY PAYMENT,Payment,Payment,400.00
03/21/2026,03/21/2026,ATM CASH WITHDRAWAL,Cash,Sale,-60.00
"""

GENERIC = """Date,Description,Amount
2026-03-06,STARBUCKS QUEEN ST,-8.90
2026-03-01,PAYROLL DIRECT DEPOSIT,2100.00
"""


def test_td_chequing_debit_credit():
    rows = parse_csv_rows(
        TD_BANK,
        {
            "date_column": "Date",
            "description_column": "Description",
            "amount_mode": "debit_credit",
            "debit_column": "Withdrawals",
            "credit_column": "Deposits",
            "date_format": "%m/%d/%Y",
        },
        account_id=1,
    )
    by_desc = {r["description"]: r for r in rows}
    assert by_desc["LOBLAWS TORONTO"]["amount"] == -85.40
    assert by_desc["ACME CORP PAYROLL"]["amount"] == 4200.00
    assert by_desc["ATM WITHDRAWAL YONGE"]["transaction_type"] == TransactionType.TRANSFER
    assert by_desc["ZELLE TO ALEX TAN"]["transaction_type"] == TransactionType.TRANSFER


def test_td_cc_invert_sign():
    rows = parse_csv_rows(
        TD_CC,
        {
            "date_column": "Transaction Date",
            "description_column": "Description",
            "amount_mode": "signed",
            "amount_column": "Amount",
            "invert_sign": True,
            "date_format": "%m/%d/%Y",
        },
        account_id=2,
    )
    by_desc = {r["description"]: r for r in rows}
    assert by_desc["TIM HORTONS #882"]["amount"] == -12.18
    assert by_desc["PAYMENT - THANK YOU"]["transaction_type"] == TransactionType.TRANSFER


def test_chase_signed_and_payment_type():
    rows = parse_csv_rows(
        CHASE_CC,
        {
            "date_column": "Transaction Date",
            "description_column": "Description",
            "amount_mode": "signed",
            "amount_column": "Amount",
            "type_column": "Type",
            "invert_sign": False,
            "date_format": "%m/%d/%Y",
        },
        account_id=3,
    )
    by_desc = {r["description"]: r for r in rows}
    assert by_desc["UBER EATS TORONTO"]["amount"] == -56.20
    assert by_desc["UBER EATS TORONTO"]["transaction_type"] == TransactionType.EXPENSE
    assert by_desc["AUTOPAY PAYMENT"]["transaction_type"] == TransactionType.TRANSFER
    assert by_desc["ATM CASH WITHDRAWAL"]["transaction_type"] == TransactionType.TRANSFER


def test_generic_date_description_amount():
    rows = parse_csv_rows(
        GENERIC,
        {
            "date_column": "Date",
            "description_column": "Description",
            "amount_mode": "signed",
            "amount_column": "Amount",
            "date_format": "%Y-%m-%d",
        },
        account_id=4,
    )
    assert len(rows) == 2
    assert rows[1]["transaction_type"] == TransactionType.INCOME


def test_detect_td_and_chase_and_generic():
    td = detect_parser(["Date", "Description", "Withdrawals", "Deposits"], "td-chequing.csv")
    assert td["institution"].value == "td"
    assert td["account_type"].value == "chequing"
    assert td["confidence"] == "high"

    chase = detect_parser(
        ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount"],
        "Chase_Sapphire.csv",
    )
    assert chase["institution"].value == "chase"
    assert chase["parser_config"]["amount_column"] == "Amount"

    generic = detect_parser(["Date", "Description", "Amount"], "export.csv")
    assert generic["institution"].value == "other"
    assert generic["parser_config"]["date_column"] == "Date"


def test_transfer_patterns():
    assert is_transfer_description("ZELLE TO ALEX")
    assert is_transfer_description("PAYMENT - THANK YOU")
    assert not is_transfer_description("COSTCO W545")
