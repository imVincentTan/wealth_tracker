from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    INVESTMENT_KINDS,
    SNAPSHOT_KINDS,
    SPENDING_KINDS,
    Account,
    Holding,
    PortfolioAccount,
    PortfolioKind,
)
from app.schemas import (
    HoldingWrite,
    PortfolioAccountRead,
    PortfolioCreate,
    PortfolioListResponse,
    PortfolioUpdate,
)
from app.services.portfolio import (
    backfill_spending_links,
    create_spending_account,
    record_snapshot,
    serialize,
)
from app.services.raw_files import move_archive_dir

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _list_payload(db: Session) -> PortfolioListResponse:
    backfill_spending_links(db)
    rows = db.query(PortfolioAccount).order_by(PortfolioAccount.name).all()
    accounts = [PortfolioAccountRead(**serialize(db, row)) for row in rows]
    assets = round(sum(a.current_value for a in accounts if a.side == "asset"), 2)
    debts = round(sum(a.current_value for a in accounts if a.side == "debt"), 2)
    return PortfolioListResponse(
        accounts=accounts,
        assets_total=assets,
        debts_total=debts,
        net=round(assets - debts, 2),
    )


def _get_row(db: Session, item_id: int) -> PortfolioAccount:
    row = db.get(PortfolioAccount, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return row


def _unique_name(db: Session, name: str, exclude_id: int | None = None) -> str:
    trimmed = name.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Enter a name.")
    query = db.query(PortfolioAccount).filter(PortfolioAccount.name == trimmed)
    if exclude_id is not None:
        query = query.filter(PortfolioAccount.id != exclude_id)
    if query.one_or_none():
        raise HTTPException(status_code=409, detail="An account with that name already exists.")
    return trimmed


@router.get("", response_model=PortfolioListResponse)
def list_portfolio(db: Session = Depends(get_db)):
    return _list_payload(db)


@router.post("", response_model=PortfolioAccountRead, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)):
    name = _unique_name(db, payload.name)
    spending_id = None
    if payload.kind in SPENDING_KINDS:
        account = create_spending_account(db, name, payload.kind, payload.institution)
        spending_id = account.id
    if payload.kind == PortfolioKind.PROPERTY:
        if payload.purchase_date is None or payload.purchase_price is None:
            raise HTTPException(status_code=400, detail="Property needs a purchase date and price.")
    if payload.kind in {PortfolioKind.MORTGAGE, PortfolioKind.LOAN} and payload.balance is None:
        raise HTTPException(status_code=400, detail="Enter a current balance for this loan.")
    linked = payload.linked_property_id
    if linked is not None:
        prop = db.get(PortfolioAccount, linked)
        if not prop or prop.kind != PortfolioKind.PROPERTY:
            raise HTTPException(status_code=400, detail="Link a property account.")
        if payload.kind not in {PortfolioKind.MORTGAGE, PortfolioKind.LOAN}:
            raise HTTPException(status_code=400, detail="Only a loan can link to a property.")

    row = PortfolioAccount(
        name=name,
        kind=payload.kind,
        spending_account_id=spending_id,
        purchase_date=payload.purchase_date if payload.kind == PortfolioKind.PROPERTY else None,
        purchase_price=payload.purchase_price if payload.kind == PortfolioKind.PROPERTY else None,
        linked_property_id=linked if payload.kind in {PortfolioKind.MORTGAGE, PortfolioKind.LOAN} else None,
    )
    db.add(row)
    db.flush()
    if payload.kind in SNAPSHOT_KINDS and payload.balance is not None:
        record_snapshot(db, row, payload.balance, date.today(), "manual")
    db.commit()
    db.refresh(row)
    return PortfolioAccountRead(**serialize(db, row))


@router.patch("/{item_id}", response_model=PortfolioAccountRead)
def update_portfolio(item_id: int, payload: PortfolioUpdate, db: Session = Depends(get_db)):
    row = _get_row(db, item_id)
    old_name = row.name
    if payload.name is not None:
        row.name = _unique_name(db, payload.name, exclude_id=row.id)
        if row.spending_account_id:
            account = db.get(Account, row.spending_account_id)
            if account:
                account.name = row.name
    if row.kind == PortfolioKind.PROPERTY:
        if payload.purchase_date is not None:
            row.purchase_date = payload.purchase_date
        if payload.purchase_price is not None:
            row.purchase_price = payload.purchase_price
    if row.kind in {PortfolioKind.MORTGAGE, PortfolioKind.LOAN} and "linked_property_id" in payload.model_fields_set:
        if payload.linked_property_id is None:
            row.linked_property_id = None
        else:
            prop = db.get(PortfolioAccount, payload.linked_property_id)
            if not prop or prop.kind != PortfolioKind.PROPERTY:
                raise HTTPException(status_code=400, detail="Link a property account.")
            row.linked_property_id = prop.id
    if payload.balance is not None:
        if row.kind not in SNAPSHOT_KINDS:
            raise HTTPException(status_code=400, detail="This account does not use a cash balance.")
        record_snapshot(db, row, payload.balance, payload.balance_as_of or date.today(), "manual")
    db.commit()
    db.refresh(row)
    if payload.name is not None and row.name != old_name and row.spending_account_id:
        move_archive_dir(old_name, row.name)
    return PortfolioAccountRead(**serialize(db, row))


@router.post("/{item_id}/holdings", response_model=PortfolioAccountRead, status_code=201)
def add_holding(item_id: int, payload: HoldingWrite, db: Session = Depends(get_db)):
    row = _get_row(db, item_id)
    if row.kind not in INVESTMENT_KINDS:
        raise HTTPException(status_code=400, detail="Holdings belong on an investment account.")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter a symbol or name.")
    db.add(
        Holding(
            portfolio_account_id=row.id,
            name=name,
            quantity=payload.quantity,
            price_cad=payload.price_cad,
        )
    )
    db.commit()
    db.refresh(row)
    return PortfolioAccountRead(**serialize(db, row))


@router.patch("/{item_id}/holdings/{holding_id}", response_model=PortfolioAccountRead)
def update_holding(
    item_id: int, holding_id: int, payload: HoldingWrite, db: Session = Depends(get_db)
):
    row = _get_row(db, item_id)
    holding = db.get(Holding, holding_id)
    if not holding or holding.portfolio_account_id != row.id:
        raise HTTPException(status_code=404, detail="Holding not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Enter a symbol or name.")
    holding.name = name
    holding.quantity = payload.quantity
    holding.price_cad = payload.price_cad
    db.commit()
    db.refresh(row)
    return PortfolioAccountRead(**serialize(db, row))


@router.delete("/{item_id}/holdings/{holding_id}", response_model=PortfolioAccountRead)
def delete_holding(item_id: int, holding_id: int, db: Session = Depends(get_db)):
    row = _get_row(db, item_id)
    holding = db.get(Holding, holding_id)
    if not holding or holding.portfolio_account_id != row.id:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()
    db.refresh(row)
    return PortfolioAccountRead(**serialize(db, row))
