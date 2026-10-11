import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
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
from app.schemas import (
    ImportCommitResponse,
    ImportDeleteResponse,
    ImportPreviewResponse,
    ImportRead,
    ImportUpdate,
    ParsedTransactionPreview,
)
from app.services.csv_parser import apply_category_rules, parse_csv_rows
from app.services.import_trace import build_import_trace, read_last_trace, write_last_trace
from app.services.raw_files import (
    delete_raw_csv,
    raw_file_relpath,
    rename_raw_csv,
    safe_filename,
    write_raw_csv,
)

router = APIRouter(prefix="/imports", tags=["imports"])

logger = logging.getLogger(__name__)


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


def _display_filename(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter a file name.")
    return name[:255]


def _import_read(imp: Import, account_name: str | None) -> ImportRead:
    return ImportRead(
        id=imp.id,
        account_id=imp.account_id,
        filename=imp.filename,
        status=imp.status,
        row_count=imp.row_count,
        created_at=imp.imported_at,
        # Files are archived exactly on commit, so only committed imports
        # have one. Recomputed from the same deterministic layout.
        raw_file=(
            raw_file_relpath(account_name, imp.id, imp.filename)
            if imp.status == ImportStatus.COMMITTED and account_name
            else None
        ),
    )


@router.get("", response_model=list[ImportRead])
def list_imports(db: Session = Depends(get_db)):
    imports = db.query(Import).order_by(Import.id.desc()).all()
    account_names = {a.id: a.name for a in db.query(Account).all()}
    return [_import_read(imp, account_names.get(imp.account_id)) for imp in imports]


@router.get("/last-trace")
def get_last_import_trace():
    """The most recent import debug trace, overwritten each preview/commit."""
    trace = read_last_trace()
    if trace is None:
        raise HTTPException(status_code=404, detail="No import trace yet")
    return trace


@router.get("/{import_id}/raw_csv")
def download_raw_csv(import_id: int, db: Session = Depends(get_db)):
    import_row = db.get(Import, import_id)
    if not import_row:
        raise HTTPException(status_code=404, detail="Import not found")
    account = db.get(Account, import_row.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = import_csv_content(import_row, account)
    filename = safe_filename(import_row.filename)
    return PlainTextResponse(
        content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    client_preview_row_count: int | None = Form(None),
    db: Session = Depends(get_db),
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = (await file.read()).decode("utf-8-sig")
    filename = file.filename or "upload.csv"
    parser_config = account.parser_config or {}
    try:
        parsed, stats = parse_csv_rows(
            content,
            parser_config,
            account.id,
            account.currency,
            filename=filename,
        )
    except ValueError as exc:
        write_last_trace(
            build_import_trace(
                account_id=account.id,
                account_name=account.name,
                filename=filename,
                parser_config=parser_config,
                client_preview_row_count=client_preview_row_count,
                preview={"status": 400, "error": str(exc)},
            )
        )
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

    trace = build_import_trace(
        account_id=account.id,
        account_name=account.name,
        filename=filename,
        parser_config=parser_config,
        stats=stats,
        skipped_duplicates=skipped,
        import_id=import_row.id,
        client_preview_row_count=client_preview_row_count,
        preview={
            "status": 200,
            "parsed_row_count": len(previews),
            "skipped_duplicates": skipped,
        },
    )
    write_last_trace(trace)

    return ImportPreviewResponse(
        import_id=import_row.id,
        filename=import_row.filename,
        account_id=account_id,
        status=import_row.status,
        transactions=previews,
        skipped_duplicates=skipped,
        import_trace=trace,
    )


def import_csv_content(import_row: Import, account: Account) -> str:
    """The exact CSV content for an import: stored text, or rebuilt from raw rows."""
    if import_row.raw_csv:
        return import_row.raw_csv

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
    return buffer.getvalue()


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

    content = import_csv_content(import_row, account)
    parser_config = account.parser_config or {}
    parsed, stats = parse_csv_rows(
        content,
        parser_config,
        account.id,
        account.currency,
        filename=import_row.filename,
    )

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

    # Archive only after the DB commit succeeds, so a failed DB commit never
    # leaves orphan files. A failed archive write logs a warning and continues.
    raw_file = write_raw_csv(account.name, import_row.id, import_row.filename, content)
    if raw_file is None:
        logger.warning("Import %s committed without an archived raw CSV", import_row.id)

    previous = read_last_trace() or {}
    same_session = previous.get("import_id") == import_row.id
    trace = build_import_trace(
        account_id=account.id,
        account_name=account.name,
        filename=import_row.filename,
        parser_config=parser_config,
        stats=stats,
        skipped_duplicates=skipped,
        import_id=import_row.id,
        client_preview_row_count=(
            previous.get("client_preview_row_count") if same_session else None
        ),
        preview=previous.get("preview") if same_session else None,
        commit={
            "status": 200,
            "committed_count": committed,
            "skipped_duplicates": skipped,
        },
    )
    write_last_trace(trace)

    return ImportCommitResponse(
        import_id=import_row.id,
        committed_count=committed,
        skipped_duplicates=skipped,
        import_trace=trace,
    )


@router.patch("/{import_id}", response_model=ImportRead)
def update_import(import_id: int, payload: ImportUpdate, db: Session = Depends(get_db)):
    import_row = db.get(Import, import_id)
    if not import_row:
        raise HTTPException(status_code=404, detail="Import not found")
    new_name = _display_filename(payload.filename)
    old_name = import_row.filename
    account = db.get(Account, import_row.account_id)
    if new_name == old_name:
        return _import_read(import_row, account.name if account else None)

    import_row.filename = new_name
    db.commit()
    db.refresh(import_row)
    if account and import_row.status == ImportStatus.COMMITTED:
        rename_raw_csv(account.name, import_row.id, old_name, new_name)
    return _import_read(import_row, account.name if account else None)


@router.delete("/{import_id}", response_model=ImportDeleteResponse)
def delete_import(import_id: int, db: Session = Depends(get_db)):
    """Remove an import, its ledger rows, raw CSV rows, and archived file."""
    import_row = db.get(Import, import_id)
    if not import_row:
        raise HTTPException(status_code=404, detail="Import not found")

    account = db.get(Account, import_row.account_id)
    filename = import_row.filename
    account_name = account.name if account else None
    deleted_transactions = (
        db.query(Transaction).filter(Transaction.import_id == import_id).count()
    )
    db.delete(import_row)
    db.commit()

    if account_name:
        delete_raw_csv(account_name, import_id, filename)

    return ImportDeleteResponse(
        import_id=import_id,
        filename=filename,
        deleted_transactions=deleted_transactions,
    )
