from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import AccountType, ImportStatus, Institution, TransactionType


class AccountCreate(BaseModel):
    name: str
    institution: Institution
    account_type: AccountType
    currency: str = "CAD"
    parser_config: dict[str, Any] = Field(default_factory=dict)


class AccountUpdate(BaseModel):
    name: str | None = None
    parser_config: dict[str, Any] | None = None


class AccountRead(BaseModel):
    id: int
    name: str
    institution: Institution
    account_type: AccountType
    currency: str
    parser_config: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    exclude_from_charts: bool = False


class CategoryRead(BaseModel):
    id: int
    name: str
    is_default: bool
    exclude_from_charts: bool

    model_config = {"from_attributes": True}


class CategoryRuleCreate(BaseModel):
    pattern: str
    category_id: int
    is_regex: bool = False


class CategoryRuleRead(BaseModel):
    id: int
    pattern: str
    is_regex: bool
    category_id: int

    model_config = {"from_attributes": True}


class ParsedTransactionPreview(BaseModel):
    transaction_date: date
    amount: float
    currency: str
    amount_cad: float
    description: str
    merchant: str | None = None
    category: str | None = None
    transaction_type: TransactionType
    dedup_hash: str
    is_duplicate: bool = False


class ImportPreviewResponse(BaseModel):
    import_id: int
    filename: str
    account_id: int
    status: ImportStatus
    headers: list[str] = Field(default_factory=list)
    parser_config: dict[str, Any] = Field(default_factory=dict)
    transactions: list[ParsedTransactionPreview]
    skipped_duplicates: int


class ImportCommitResponse(BaseModel):
    import_id: int
    committed_count: int
    skipped_duplicates: int


class ImportRead(BaseModel):
    id: int
    account_id: int
    filename: str
    status: ImportStatus
    row_count: int
    imported_at: datetime
    has_raw_csv: bool = False

    model_config = {"from_attributes": True}


class CsvDetectResponse(BaseModel):
    filename: str
    headers: list[str]
    sample_rows: list[dict[str, Any]]
    institution: Institution | None = None
    account_type: AccountType | None = None
    parser_config: dict[str, Any]
    confidence: str
    notes: str


class TransactionRead(BaseModel):
    id: int
    account_id: int
    transaction_date: date
    amount: float
    currency: str
    amount_cad: float
    description: str
    merchant: str | None = None
    category: str | None
    transaction_type: TransactionType

    model_config = {"from_attributes": True}


class TransactionUpdate(BaseModel):
    category: str | None = None
    transaction_type: TransactionType | None = None


class RecategorizeMerchantRequest(BaseModel):
    pattern: str
    category: str
    save_rule: bool = True


class RecategorizeMerchantResponse(BaseModel):
    pattern: str
    category: str
    updated_count: int
    rule_id: int | None = None


class MonthlySummary(BaseModel):
    month: str
    income: float
    expenses: float
    net: float


class CategoryBreakdown(BaseModel):
    category: str
    total: float
    count: int


class MerchantBreakdown(BaseModel):
    merchant: str
    total: float
    count: int


class DashboardResponse(BaseModel):
    monthly: list[MonthlySummary]
    by_category: list[CategoryBreakdown]
    top_merchants: list[MerchantBreakdown]
    total_income: float
    total_expenses: float
    total_spent: float
    total_net: float
    transaction_count: int


class SampleHouseholdResponse(BaseModel):
    created_accounts: int
    created_transactions: int
    already_loaded: bool = False
