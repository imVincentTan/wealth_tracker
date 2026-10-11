from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    DEBT_KINDS,
    INVESTMENT_KINDS,
    SPENDING_KINDS,
    Account,
    AccountType,
    BalanceSnapshot,
    Holding,
    Institution,
    PortfolioAccount,
    PortfolioKind,
)
from app.parsers.defaults import get_default_parser_config


def _money(value: object) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return round(float(value), 2)


def latest_snapshot(db: Session, portfolio_id: int) -> BalanceSnapshot | None:
    return (
        db.query(BalanceSnapshot)
        .filter(BalanceSnapshot.portfolio_account_id == portfolio_id)
        .order_by(BalanceSnapshot.as_of.desc(), BalanceSnapshot.id.desc())
        .first()
    )


def record_snapshot(
    db: Session,
    portfolio: PortfolioAccount,
    amount: float,
    as_of: date,
    source: str,
) -> BalanceSnapshot:
    stored = abs(amount) if portfolio.kind in DEBT_KINDS else amount
    row = BalanceSnapshot(
        portfolio_account_id=portfolio.id,
        amount=round(stored, 2),
        as_of=as_of,
        source=source,
    )
    db.add(row)
    db.flush()
    return row


def ensure_portfolio_for_spending(db: Session, account: Account) -> PortfolioAccount:
    existing = (
        db.query(PortfolioAccount)
        .filter(PortfolioAccount.spending_account_id == account.id)
        .one_or_none()
    )
    if existing:
        if existing.name != account.name:
            existing.name = account.name
        return existing
    kind = PortfolioKind(account.account_type.value)
    clash = (
        db.query(PortfolioAccount)
        .filter(PortfolioAccount.name == account.name, PortfolioAccount.spending_account_id.is_(None))
        .one_or_none()
    )
    if clash and clash.kind in SPENDING_KINDS and clash.kind == kind:
        clash.spending_account_id = account.id
        return clash
    row = PortfolioAccount(
        name=account.name,
        kind=kind,
        spending_account_id=account.id,
    )
    db.add(row)
    db.flush()
    return row


def backfill_spending_links(db: Session) -> None:
    linked = {
        row.spending_account_id
        for row in db.query(PortfolioAccount.spending_account_id)
        .filter(PortfolioAccount.spending_account_id.isnot(None))
        .all()
    }
    dirty = False
    for account in db.query(Account).all():
        if account.id in linked:
            continue
        ensure_portfolio_for_spending(db, account)
        dirty = True
    if dirty:
        db.commit()


def current_value(db: Session, row: PortfolioAccount) -> float:
    if row.kind in INVESTMENT_KINDS:
        return round(sum(_money(h.quantity) * _money(h.price_cad) for h in row.holdings), 2)
    if row.kind == PortfolioKind.PROPERTY:
        return _money(row.purchase_price)
    snap = latest_snapshot(db, row.id)
    return _money(snap.amount) if snap else 0.0


def holding_value(holding: Holding) -> float:
    return round(_money(holding.quantity) * _money(holding.price_cad), 2)


def serialize(db: Session, row: PortfolioAccount) -> dict:
    snap = latest_snapshot(db, row.id)
    linked_name = None
    if row.linked_property_id:
        prop = db.get(PortfolioAccount, row.linked_property_id)
        linked_name = prop.name if prop else None
    value = current_value(db, row)
    side = "debt" if row.kind in DEBT_KINDS else "asset"
    return {
        "id": row.id,
        "name": row.name,
        "kind": row.kind.value,
        "spending_account_id": row.spending_account_id,
        "purchase_date": row.purchase_date.isoformat() if row.purchase_date else None,
        "purchase_price": _money(row.purchase_price) if row.purchase_price is not None else None,
        "linked_property_id": row.linked_property_id,
        "linked_property_name": linked_name,
        "balance": _money(snap.amount) if snap else None,
        "balance_as_of": snap.as_of.isoformat() if snap else None,
        "holdings": [
            {
                "id": h.id,
                "name": h.name,
                "quantity": float(h.quantity),
                "price_cad": _money(h.price_cad),
                "value_cad": holding_value(h),
            }
            for h in sorted(row.holdings, key=lambda item: item.id)
        ],
        "current_value": value,
        "side": side,
    }


def spending_account_type(kind: PortfolioKind) -> AccountType:
    return AccountType(kind.value)


def create_spending_account(db: Session, name: str, kind: PortfolioKind, institution) -> Account:
    inst = institution if institution is not None else Institution.OTHER
    parser_config = get_default_parser_config(inst.value, kind.value)
    account = Account(
        name=name,
        institution=inst,
        account_type=spending_account_type(kind),
        currency="CAD",
        parser_config=parser_config,
    )
    db.add(account)
    db.flush()
    return account
