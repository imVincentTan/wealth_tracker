from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.database import Base


def ensure_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "imports" in tables:
        columns = {col["name"] for col in inspector.get_columns("imports")}
        if "raw_csv" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE imports ADD COLUMN raw_csv TEXT"))

    if engine.dialect.name != "postgresql":
        return

    extra_values = {
        "institution": ("chase", "other", "CHASE", "OTHER"),
    }
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for type_name, values in extra_values.items():
            exists = conn.execute(
                text("SELECT 1 FROM pg_type WHERE typname = :name"),
                {"name": type_name},
            ).first()
            if not exists:
                continue
            for value in values:
                conn.execute(text(f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{value}'"))
