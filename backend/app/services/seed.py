from sqlalchemy.orm import Session

from app.models import Category, CategoryRule

DEFAULT_CATEGORIES = [
    ("Groceries", False),
    ("Dining", False),
    ("Transport", False),
    ("Housing", False),
    ("Utilities", False),
    ("Shopping", False),
    ("Entertainment", False),
    ("Healthcare", False),
    ("Travel", False),
    ("Subscriptions", False),
    ("Personal", False),
    ("Income", False),
    ("Transfer", True),
    ("Fees", False),
    ("Other", False),
]

DEFAULT_RULES: list[tuple[str, str, bool]] = [
    ("payment thank you", "Transfer", False),
    ("autopay", "Transfer", False),
    ("credit crd", "Transfer", False),
    ("zelle", "Transfer", False),
    ("venmo", "Transfer", False),
    ("atm withdrawal", "Transfer", False),
    ("payroll", "Income", False),
    ("direct deposit", "Income", False),
    ("tax refund", "Income", False),
    ("irs treas", "Income", False),
    ("whole foods", "Groceries", False),
    ("trader joe", "Groceries", False),
    ("costco", "Groceries", False),
    ("starbucks", "Dining", False),
    ("chipotle", "Dining", False),
    ("uber eats", "Dining", False),
    ("doordash", "Dining", False),
    ("uber", "Transport", False),
    ("lyft", "Transport", False),
    ("shell oil", "Transport", False),
    ("chevron", "Transport", False),
    ("rent", "Housing", False),
    ("apartments", "Housing", False),
    ("pgande", "Utilities", False),
    ("xfinity", "Utilities", False),
    ("verizon", "Utilities", False),
    ("amazon", "Shopping", False),
    ("target", "Shopping", False),
    ("netflix", "Subscriptions", False),
    ("spotify", "Subscriptions", False),
    ("apple.com/bill", "Subscriptions", False),
    ("cvs", "Healthcare", False),
    ("walgreens", "Healthcare", False),
    ("delta air", "Travel", False),
    ("hilton", "Travel", False),
    ("planet fitness", "Personal", False),
    ("amc", "Entertainment", False),
    ("fee", "Fees", False),
]


def seed_default_categories(db: Session) -> None:
    existing = {c.name: c for c in db.query(Category).all()}
    for name, exclude in DEFAULT_CATEGORIES:
        if name not in existing:
            category = Category(name=name, is_default=True, exclude_from_charts=exclude)
            db.add(category)
            db.flush()
            existing[name] = category
    db.commit()

    existing = {c.name: c for c in db.query(Category).all()}
    existing_patterns = {r.pattern.lower() for r in db.query(CategoryRule).all()}
    for pattern, category_name, is_regex in DEFAULT_RULES:
        if pattern.lower() in existing_patterns:
            continue
        category = existing.get(category_name)
        if not category:
            continue
        db.add(
            CategoryRule(
                pattern=pattern,
                is_regex=is_regex,
                category_id=category.id,
            )
        )
        existing_patterns.add(pattern.lower())
    db.commit()
