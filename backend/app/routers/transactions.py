from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, CategoryRule, Transaction, TransactionType
from app.schemas import (
    RecategorizeMerchantRequest,
    RecategorizeMerchantResponse,
    TransactionRead,
    TransactionUpdate,
)
from app.services.csv_parser import merchant_key

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_read(txn: Transaction) -> TransactionRead:
    return TransactionRead(
        id=txn.id,
        account_id=txn.account_id,
        transaction_date=txn.transaction_date,
        amount=float(txn.amount),
        currency=txn.currency,
        amount_cad=float(txn.amount_cad),
        description=txn.description,
        merchant=merchant_key(txn.description),
        category=txn.category,
        transaction_type=txn.transaction_type,
    )


@router.get("", response_model=list[TransactionRead])
def list_transactions(
    account_id: int | None = None,
    category: str | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=500, le=5000),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if category:
        query = query.filter(Transaction.category == category)
    if search:
        query = query.filter(Transaction.description.ilike(f"%{search}%"))
    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)
    return [_to_read(txn) for txn in query.limit(limit).all()]


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if payload.category is not None:
        txn.category = payload.category
        if payload.category == "Transfer":
            txn.transaction_type = TransactionType.TRANSFER
        elif payload.category == "Income" and txn.transaction_type == TransactionType.TRANSFER:
            txn.transaction_type = TransactionType.INCOME
    if payload.transaction_type is not None:
        txn.transaction_type = payload.transaction_type
    db.commit()
    db.refresh(txn)
    return _to_read(txn)


@router.post("/recategorize-merchant", response_model=RecategorizeMerchantResponse)
def recategorize_merchant(payload: RecategorizeMerchantRequest, db: Session = Depends(get_db)):
    pattern = payload.pattern.strip()
    if not pattern:
        raise HTTPException(status_code=400, detail="pattern is required")

    category = db.query(Category).filter(Category.name == payload.category).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    matches = (
        db.query(Transaction)
        .filter(Transaction.description.ilike(f"%{pattern}%"))
        .all()
    )
    for txn in matches:
        txn.category = category.name
        if category.name == "Transfer" or category.exclude_from_charts:
            txn.transaction_type = TransactionType.TRANSFER
        elif category.name == "Income":
            txn.transaction_type = TransactionType.INCOME
        elif txn.transaction_type == TransactionType.TRANSFER:
            amount = float(txn.amount_cad)
            txn.transaction_type = TransactionType.INCOME if amount > 0 else TransactionType.EXPENSE

    rule_id = None
    if payload.save_rule:
        existing = (
            db.query(CategoryRule)
            .filter(CategoryRule.pattern == pattern, CategoryRule.is_regex.is_(False))
            .first()
        )
        if existing:
            existing.category_id = category.id
            rule_id = existing.id
        else:
            rule = CategoryRule(pattern=pattern, category_id=category.id, is_regex=False)
            db.add(rule)
            db.flush()
            rule_id = rule.id

    db.commit()
    return RecategorizeMerchantResponse(
        pattern=pattern,
        category=category.name,
        updated_count=len(matches),
        rule_id=rule_id,
    )
