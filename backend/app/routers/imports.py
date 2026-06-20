from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Category, CategoryRule, Import, ImportStatus, RawImportRow, Transaction
from app.schemas import ImportCommitResponse, ImportPreviewResponse, ParsedTransactionPreview
from app.services.csv_parser import apply_category_rules, parse_csv_rows

router = APIRouter(prefix="/imports", tags=["imports"])


def _load_rules(db: Session) -> list[tuple[str, str, bool]]:
    rows = (
        db.query(CategoryRule.pattern, CategoryRule.is_regex, CategoryRule.category_id)
        .join(CategoryRule.category)
        .all()
    )
    category_names = {c.id: c.name for c in db.query(Category).all()}
    return [(pattern, category_names[cat_id], is_regex) for pattern, is_regex, cat_id in rows]


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = (await file.read()).decode("utf-8-sig")
    try:
        parsed = parse_csv_rows(content, account.parser_config, account.id, account.currency)
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
    )
    db.add(import_row)
    db.flush()

    previews: list[ParsedTransactionPreview] = []
    skipped = 0
    for item in parsed:
        category = apply_category_rules(item["description"], rules)
        is_dup = item["dedup_hash"] in existing_hashes
        if is_dup:
            skipped += 1
        previews.append(
            ParsedTransactionPreview(
                transaction_date=item["transaction_date"],
                amount=float(item["amount"]),
                currency=item["currency"],
                amount_cad=float(item["amount_cad"]),
                description=item["description"],
                category=category,
                transaction_type=item["transaction_type"],
                dedup_hash=item["dedup_hash"],
                is_duplicate=is_dup,
            )
        )
        db.add(
            RawImportRow(
                import_id=import_row.id,
                row_number=item["row_number"],
                raw_data=item["raw_data"],
            )
        )

    db.commit()
    db.refresh(import_row)

    return ImportPreviewResponse(
        import_id=import_row.id,
        filename=import_row.filename,
        account_id=account_id,
        status=import_row.status,
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

    content_rows = import_row.raw_rows
    if not content_rows:
        raise HTTPException(status_code=400, detail="Import has no rows")

    # Re-parse from stored raw rows using current parser config
    import csv
    import io

    fieldnames = list(content_rows[0].raw_data.keys())
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in sorted(content_rows, key=lambda r: r.row_number):
        writer.writerow(row.raw_data)
    parsed = parse_csv_rows(buffer.getvalue(), account.parser_config, account.id, account.currency)

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
        category = apply_category_rules(item["description"], rules)
        txn = Transaction(
            account_id=account.id,
            import_id=import_row.id,
            transaction_date=item["transaction_date"],
            amount=item["amount"],
            currency=item["currency"],
            amount_cad=item["amount_cad"],
            description=item["description"],
            category=category or "Uncategorized",
            transaction_type=item["transaction_type"],
            dedup_hash=item["dedup_hash"],
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
