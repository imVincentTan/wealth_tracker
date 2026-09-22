from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Account,
    Category,
    CategoryRule,
    Import,
    ImportStatus,
    RawImportRow,
    Transaction,
    TransactionType,
)
from app.schemas import ImportCommitResponse, ImportPreviewResponse, ParsedTransactionPreview
from app.services.csv_parser import apply_category_rules, parse_csv_rows

router = APIRouter(prefix="/imports", tags=["imports"])


def _load_rules(db: Session) -> list[tuple[str, str, bool]]:
    # Newest rule wins: user-created rules (from apply-to-merchant or the
    # rules endpoint) always postdate the seeded defaults, so they override
    # them when both match a description.
    rows = (
        db.query(CategoryRule.pattern, CategoryRule.is_regex, CategoryRule.category_id)
        .join(CategoryRule.category)
        .order_by(CategoryRule.id.desc())
        .all()
    )
    category_names = {c.id: c.name for c in db.query(Category).all()}
    return [(pattern, category_names[cat_id], is_regex) for pattern, is_regex, cat_id in rows]


def _typed_category(description: str, amount_type: TransactionType, rules: list[tuple[str, str, bool]]) -> tuple[str, TransactionType]:
    category = apply_category_rules(description, rules)
    if category == "Transfer":
        return category, TransactionType.TRANSFER
    if category == "Income":
        return category, TransactionType.INCOME
    if not category:
        category = "Income" if amount_type == TransactionType.INCOME else "Other"
    return category, amount_type


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
    filename = file.filename or "upload.csv"
    try:
        parsed = parse_csv_rows(
            content,
            account.parser_config or {},
            account.id,
            account.currency,
            filename=filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rules = _load_rules(db)
    existing_hashes = {
        row[0]
        for row in db.query(Transaction.dedup_hash).filter(Transaction.account_id == account_id).all()
    }

    import_row = Import(
        account_id=account_id,
        filename=filename,
        status=ImportStatus.PREVIEW,
        row_count=len(parsed),
        raw_csv=content,
    )
    db.add(import_row)
    db.flush()

    previews: list[ParsedTransactionPreview] = []
    skipped = 0
    for item in parsed:
        category, txn_type = _typed_category(item["description"], item["transaction_type"], rules)
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
                merchant=item.get("merchant"),
                category=category,
                transaction_type=txn_type,
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

    if import_row.raw_csv:
        parsed = parse_csv_rows(
            import_row.raw_csv,
            account.parser_config or {},
            account.id,
            account.currency,
            filename=import_row.filename,
        )
    else:
        content_rows = import_row.raw_rows
        if not content_rows:
            raise HTTPException(status_code=400, detail="Import has no rows")
        import csv
        import io

        fieldnames = list(content_rows[0].raw_data.keys())
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(content_rows, key=lambda r: r.row_number):
            writer.writerow(row.raw_data)
        parsed = parse_csv_rows(buffer.getvalue(), account.parser_config or {}, account.id, account.currency)

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
        category, txn_type = _typed_category(item["description"], item["transaction_type"], rules)
        txn = Transaction(
            account_id=account.id,
            import_id=import_row.id,
            transaction_date=item["transaction_date"],
            amount=item["amount"],
            currency=item["currency"],
            amount_cad=item["amount_cad"],
            description=item["description"],
            merchant=item.get("merchant"),
            category=category,
            transaction_type=txn_type,
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
