from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Transaction, TransactionType
from app.schemas import CategoryBreakdown, DashboardResponse, MonthlySummary

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
    total_income = 0.0
    total_expenses = 0.0

    for txn in txns:
        month_key = txn.transaction_date.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = {"income": 0.0, "expenses": 0.0}

        amount = float(txn.amount_cad)
        if txn.transaction_type == TransactionType.INCOME:
            monthly[month_key]["income"] += amount
            total_income += amount
        elif txn.transaction_type == TransactionType.EXPENSE:
            monthly[month_key]["expenses"] += abs(amount)
            total_expenses += abs(amount)

            cat = txn.category or "Uncategorized"
            if cat not in excluded:
                if cat not in category_totals:
                    category_totals[cat] = {"total": 0.0, "count": 0}
                category_totals[cat]["total"] += abs(amount)
                category_totals[cat]["count"] += 1

    monthly_list = [
        MonthlySummary(
            month=m,
            income=vals["income"],
            expenses=vals["expenses"],
            net=vals["income"] - vals["expenses"],
        )
        for m, vals in sorted(monthly.items())
    ]

    by_category = [
        CategoryBreakdown(category=cat, total=float(vals["total"]), count=int(vals["count"]))
        for cat, vals in sorted(category_totals.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    return DashboardResponse(
        monthly=monthly_list,
        by_category=by_category,
        total_income=total_income,
        total_expenses=total_expenses,
    )
