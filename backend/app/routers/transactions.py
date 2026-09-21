from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, CategoryRule, Transaction, TransactionType
from app.schemas import TransactionRead, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionRead])
def list_transactions(
    account_id: int | None = None,
    category: str | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=2000, le=10000),
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
    return query.limit(limit).all()


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
        elif payload.category == "Income":
            txn.transaction_type = TransactionType.INCOME
        elif txn.transaction_type == TransactionType.TRANSFER:
            txn.transaction_type = (
                TransactionType.INCOME if float(txn.amount) > 0 else TransactionType.EXPENSE
            )
        if payload.apply_to_merchant and (txn.merchant or txn.description):
            merchant = txn.merchant or txn.description
            siblings = db.query(Transaction).filter(Transaction.merchant == merchant).all()
            for row in siblings:
                row.category = payload.category
                row.transaction_type = txn.transaction_type
            category = db.query(Category).filter(Category.name == payload.category).first()
            if category:
                db.add(
                    CategoryRule(
                        pattern=merchant,
                        is_regex=False,
                        category_id=category.id,
                    )
                )
    if payload.transaction_type is not None:
        txn.transaction_type = payload.transaction_type
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()
    return None
