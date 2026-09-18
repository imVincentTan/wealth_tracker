import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [e.value for e in enum_cls]


class Institution(str, enum.Enum):
    TD = "td"
    AMEX = "amex"
    CHASE = "chase"
    OTHER = "other"


class AccountType(str, enum.Enum):
    CHEQUING = "chequing"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"


class TransactionType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class ImportStatus(str, enum.Enum):
    PREVIEW = "preview"
    COMMITTED = "committed"
    FAILED = "failed"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    institution: Mapped[Institution] = mapped_column(
        Enum(Institution, values_callable=_enum_values, name="institution")
    )
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, values_callable=_enum_values, name="accounttype")
    )
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    parser_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")
    imports: Mapped[list["Import"]] = relationship(back_populates="account")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    exclude_from_charts: Mapped[bool] = mapped_column(Boolean, default=False)

    rules: Mapped[list["CategoryRule"]] = relationship(back_populates="category")


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(200))
    is_regex: Mapped[bool] = mapped_column(Boolean, default=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))

    category: Mapped["Category"] = relationship(back_populates="rules")


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, values_callable=_enum_values, name="importstatus"),
        default=ImportStatus.PREVIEW,
    )
    row_count: Mapped[int] = mapped_column(default=0)
    raw_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="imports")
    raw_rows: Mapped[list["RawImportRow"]] = relationship(
        back_populates="import_", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_")


class RawImportRow(Base):
    __tablename__ = "raw_import_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id"))
    row_number: Mapped[int] = mapped_column()
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSON)

    import_: Mapped["Import"] = relationship(back_populates="raw_rows")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("dedup_hash", name="uq_transaction_dedup"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id"), nullable=True)
    transaction_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    amount_cad: Mapped[float] = mapped_column(Numeric(14, 2))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, values_callable=_enum_values, name="transactiontype")
    )
    dedup_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["Account"] = relationship(back_populates="transactions")
    import_: Mapped["Import | None"] = relationship(back_populates="transactions")
