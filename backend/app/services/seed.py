from sqlalchemy.orm import Session

from app.models import Category, CategoryRule

DEFAULT_CATEGORIES = [
    ("Groceries", False),
    ("Dining", False),
    ("Transport", False),
    ("Housing", False),
    ("Utilities", False),
    ("Shopping", False),
    ("Health", False),
    ("Entertainment", False),
    ("Income", False),
    ("Transfer", True),
    ("Other", False),
    ("Uncategorized", False),
]

DEFAULT_RULES = [
    ("COSTCO", "Groceries"),
    ("WALMART", "Groceries"),
    ("LOBLAWS", "Groceries"),
    ("NOFRILLS", "Groceries"),
    ("NO FRILLS", "Groceries"),
    ("METRO", "Groceries"),
    ("STARBUCKS", "Dining"),
    ("TIM HORTONS", "Dining"),
    ("UBER EATS", "Dining"),
    ("DOORDASH", "Dining"),
    ("UBER", "Transport"),
    ("LYFT", "Transport"),
    ("PRESTO", "Transport"),
    ("SHELL", "Transport"),
    ("ESSO", "Transport"),
    ("NETFLIX", "Entertainment"),
    ("SPOTIFY", "Entertainment"),
    ("AMAZON", "Shopping"),
    ("PAYROLL", "Income"),
    ("DIRECT DEPOSIT", "Income"),
    ("ZELLE", "Transfer"),
    ("INTERAC", "Transfer"),
    ("E-TRANSFER", "Transfer"),
    ("ATM", "Transfer"),
]


def seed_default_categories(db: Session) -> None:
    existing = {c.name: c for c in db.query(Category).all()}
    for name, exclude in DEFAULT_CATEGORIES:
        if name not in existing:
            category = Category(name=name, is_default=True, exclude_from_charts=exclude)
            db.add(category)
            db.flush()
            existing[name] = category
    db.flush()

    existing_patterns = {r.pattern.lower() for r in db.query(CategoryRule).all()}
    for pattern, category_name in DEFAULT_RULES:
        if pattern.lower() in existing_patterns:
            continue
        category = existing.get(category_name)
        if not category:
            continue
        db.add(CategoryRule(pattern=pattern, category_id=category.id, is_regex=False))
        existing_patterns.add(pattern.lower())
    db.commit()
