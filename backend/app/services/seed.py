from sqlalchemy.orm import Session

from app.models import Category

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


def seed_default_categories(db: Session) -> None:
    existing = {c.name for c in db.query(Category).all()}
    for name, exclude in DEFAULT_CATEGORIES:
        if name not in existing:
            db.add(Category(name=name, is_default=True, exclude_from_charts=exclude))
    db.commit()
