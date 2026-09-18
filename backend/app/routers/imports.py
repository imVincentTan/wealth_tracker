import csv
import io
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Category, CategoryRule, Import, ImportStatus, RawImportRow, Transaction, TransactionType
from app.schemas import (
    CsvDetectResponse,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportRead,
    ParsedTransactionPreview,
)
from app.services.csv_parser import apply_category_rules, iter_csv_rows, parse_csv_rows
from app.services.detect import detect_parser

router = APIRouter(prefix="/imports", tags=["imports"])


def _load_rules(db: Session) -> list[tuple[str, str, bool]]:
    rows = (
        db.query(CategoryRule.pattern, CategoryRule.is_regex, CategoryRule.category_id)
        .join(CategoryRule.category)
        .all()
    )
    category_names = {c.id: c.name for c in db.query(Category).all()}
    return [(pattern, category_names[cat_id], is_regex) for pattern, is_regex, cat_id in rows]


def _with_rules(item: dict, rules: list[tuple[str, str, bool]]) -> dict:
    category = apply_category_rules(item["description"], rules)
    txn_type = item["transaction_type"]
    if category == "Transfer":
        txn_type = TransactionType.TRANSFER
    elif txn_type == TransactionType.TRANSFER:
        category = category or "Transfer"
    elif txn_type == TransactionType.INCOME:
        category = category or "Income"
    return {**item, "category": category, "transaction_type": txn_type}


@router.get("", response_model=list[ImportRead])
def list_imports(db: Session = Depends(get_db)):
    rows = db.query(Import).order_by(Import.imported_at.desc()).all()
    return [
        ImportRead(
            id=row.id,
            account_id=row.account_id,
            filename=row.filename,
            status=row.status,
            row_count=row.row_count,
            imported_at=row.imported_at,
            has_raw_csv=bool(row.raw_csv),
        )
        for row in rows
    ]


@router.post("/detect", response_model=CsvDetectResponse)
async def detect_csv(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8-sig")
    try:
        headers, rows = iter_csv_rows(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    detected = detect_parser(headers, file.filename or "")
    return CsvDetectResponse(
        filename=file.filename or "upload.csv",
        headers=headers,
        sample_rows=[row for _, row in rows[:8]],
        institution=detected["institution"],
        account_type=detected["account_type"],
        parser_config=detected["parser_config"],
        confidence=detected["confidence"],
        notes=detected["notes"],
    )


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    parser_config: str | None = Form(default=None),
    save_mapping: str = Form(default="false"),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = (await file.read()).decode("utf-8-sig")
    config = dict(account.parser_config or {})
    if parser_config:
        try:
            override = json.loads(parser_config)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="parser_config must be JSON") from exc
        if not isinstance(override, dict):
            raise HTTPException(status_code=400, detail="parser_config must be an object")
        config.update(override)
        if save_mapping.lower() in {"1", "true", "yes", "on"}:
            account.parser_config = config

    try:
        headers, raw_rows = iter_csv_rows(content)
        parsed = parse_csv_rows(content, config, account.id, account.currency)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rules = _load_rules(db)
    existing_hashes = {
        row[0]
        for row in db.query(Transaction.dedup_hash).filter(Transaction.account_id == account_id).all()
    }

    import_row = Import(
        account_id=account_id,
        filename=file.filename or "upload.csv",
        status=ImportStatus.PREVIEW,
        row_count=len(parsed),
        raw_csv=content,
    )
    db.add(import_row)
    db.flush()

    for row_number, raw_data in raw_rows:
        db.add(RawImportRow(import_id=import_row.id, row_number=row_number, raw_data=raw_data))

    previews: list[ParsedTransactionPreview] = []
    skipped = 0
    for item in parsed:
        classified = _with_rules(item, rules)
        is_dup = item["dedup_hash"] in existing_hashes
        if is_dup:
            skipped += 1
        previews.append(
            ParsedTransactionPreview(
                transaction_date=classified["transaction_date"],
                amount=float(classified["amount"]),
                currency=classified["currency"],
                amount_cad=float(classified["amount_cad"]),
                description=classified["description"],
                merchant=classified.get("merchant"),
                category=classified["category"],
                transaction_type=classified["transaction_type"],
                dedup_hash=classified["dedup_hash"],
                is_duplicate=is_dup,
            )
        )

    db.commit()
    db.refresh(import_row)

    return ImportPreviewResponse(
        import_id=import_row.id,
        filename=import_row.filename,
        account_id=account_id,
        status=import_row.status,
        headers=headers,
        parser_config=config,
        transactions=previews,
        skipped_duplicates=skipped,
    )


@router.post("/{import_id}/commit", response_model=ImportCommitResponse)
def commit_import(import_id: int, db: Session = Depends(get_db)):
    import_row = db.get(Import, import_id)
    if not import_row:
        raise HTTPException(status_code=404, detail="Import not found")
    if import_row.status == ImportStatus.COMMITTED:
        raise HTTPException(status_code=409, detail="Import already committed")

    account = db.get(Account, import_row.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if import_row.raw_csv:
        content = import_row.raw_csv
    else:
        content_rows = import_row.raw_rows
        if not content_rows:
            raise HTTPException(status_code=400, detail="Import has no rows")
        fieldnames = list(content_rows[0].raw_data.keys())
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(content_rows, key=lambda r: r.row_number):
            writer.writerow(row.raw_data)
        content = buffer.getvalue()

    parsed = parse_csv_rows(content, account.parser_config, account.id, account.currency)
    rules = _load_rules(db)
    existing_hashes = {
        row[0]
        for row in db.query(Transaction.dedup_hash).filter(Transaction.account_id == account.id).all()
    }

    committed = 0
    skipped = 0
    for item in parsed:
        if item["dedup_hash"] in existing_hashes:
            skipped += 1
            continue
        classified = _with_rules(item, rules)
        txn = Transaction(
            account_id=account.id,
            import_id=import_row.id,
            transaction_date=classified["transaction_date"],
            amount=classified["amount"],
            currency=classified["currency"],
            amount_cad=classified["amount_cad"],
            description=classified["description"],
            category=classified["category"] or "Uncategorized",
            transaction_type=classified["transaction_type"],
            dedup_hash=classified["dedup_hash"],
        )
        db.add(txn)
        existing_hashes.add(item["dedup_hash"])
        committed += 1

    import_row.status = ImportStatus.COMMITTED
    import_row.row_count = committed
    db.commit()

    return ImportCommitResponse(
        import_id=import_row.id,
        committed_count=committed,
        skipped_duplicates=skipped,
    )
