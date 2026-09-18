from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Transaction, TransactionType
from app.schemas import CategoryBreakdown, DashboardResponse, MerchantBreakdown, MonthlySummary
from app.services.csv_parser import merchant_key

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    exclude_categories: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
):
    excluded = set(exclude_categories)
    default_excluded = {
        c.name for c in db.query(Category).filter(Category.exclude_from_charts.is_(True)).all()
    }
    excluded |= default_excluded

    txns = db.query(Transaction).all()

    monthly: dict[str, dict[str, float]] = {}
    category_totals: dict[str, dict[str, float | int]] = {}
    merchant_totals: dict[str, dict[str, float | int]] = {}
    total_income = 0.0
    total_expenses = 0.0

    for txn in txns:
        month_key = txn.transaction_date.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = {"income": 0.0, "expenses": 0.0}

        amount = float(txn.amount_cad)
        if txn.transaction_type == TransactionType.TRANSFER:
            continue
        if txn.category and txn.category in excluded:
            continue

        if txn.transaction_type == TransactionType.INCOME:
            monthly[month_key]["income"] += amount
            total_income += amount
        elif txn.transaction_type == TransactionType.EXPENSE:
            spent = abs(amount)
            monthly[month_key]["expenses"] += spent
            total_expenses += spent

            cat = txn.category or "Uncategorized"
            if cat not in category_totals:
                category_totals[cat] = {"total": 0.0, "count": 0}
            category_totals[cat]["total"] += spent
            category_totals[cat]["count"] += 1

            merchant = merchant_key(txn.description)
            if merchant not in merchant_totals:
                merchant_totals[merchant] = {"total": 0.0, "count": 0}
            merchant_totals[merchant]["total"] += spent
            merchant_totals[merchant]["count"] += 1

    monthly_list = [
        MonthlySummary(
            month=m,
            income=round(vals["income"], 2),
            expenses=round(vals["expenses"], 2),
            net=round(vals["income"] - vals["expenses"], 2),
        )
        for m, vals in sorted(monthly.items())
    ]

    by_category = [
        CategoryBreakdown(category=cat, total=round(float(vals["total"]), 2), count=int(vals["count"]))
        for cat, vals in sorted(category_totals.items(), key=lambda x: x[1]["total"], reverse=True)
    ]
    top_merchants = [
        MerchantBreakdown(merchant=name, total=round(float(vals["total"]), 2), count=int(vals["count"]))
        for name, vals in sorted(merchant_totals.items(), key=lambda x: x[1]["total"], reverse=True)[:12]
    ]

    return DashboardResponse(
        monthly=monthly_list,
        by_category=by_category,
        top_merchants=top_merchants,
        total_income=round(total_income, 2),
        total_expenses=round(total_expenses, 2),
        total_spent=round(total_expenses, 2),
        total_net=round(total_income - total_expenses, 2),
        transaction_count=len(txns),
    )
