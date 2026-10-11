export const ACCOUNT_KINDS = ["checking", "credit", "savings", "other"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const PORTFOLIO_KINDS = [
  "chequing",
  "savings",
  "credit_card",
  "tfsa",
  "rrsp",
  "fhsa",
  "non_registered",
  "property",
  "mortgage",
  "loan",
] as const;
export type PortfolioKind = (typeof PORTFOLIO_KINDS)[number];

export type Holding = {
  id: number;
  name: string;
  quantity: number;
  price_cad: number;
  value_cad: number;
};

export type PortfolioAccount = {
  id: number;
  name: string;
  kind: PortfolioKind;
  spending_account_id: number | null;
  purchase_date: string | null;
  purchase_price: number | null;
  linked_property_id: number | null;
  linked_property_name: string | null;
  balance: number | null;
  balance_as_of: string | null;
  holdings: Holding[];
  current_value: number;
  side: "asset" | "debt";
};

export type PortfolioSummary = {
  accounts: PortfolioAccount[];
  assets_total: number;
  debts_total: number;
  net: number;
};

export const CATEGORY_IDS = [
  "groceries",
  "dining",
  "transport",
  "housing",
  "utilities",
  "shopping",
  "entertainment",
  "healthcare",
  "travel",
  "subscriptions",
  "personal",
  "income",
  "transfers",
  "fees",
  "other",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  parserConfig: Record<string, unknown>;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  category: CategoryId;
  accountId: string;
  sourceFile: string;
  fingerprint: string;
  bankCategory?: string;
};

export type ColumnMapping = {
  date: string | null;
  description: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  category: string | null;
  type: string | null;
  /** Running-balance column, recognized so it is never mistaken for an amount */
  balance: string | null;
};

export type DatePreset =
  | "all"
  | "this-month"
  | "last-month"
  | "last-30"
  | "last-90"
  | "this-year";

export type ImportPreview = {
  formatName: string;
  confidence: "high" | "medium" | "low";
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  suggestedKind: AccountKind;
  suggestedName: string;
  invertAmounts: boolean;
  fileName: string;
  /** 1-indexed row holding column names; 0 = no header row */
  headerRow: number;
  /** "" = auto-detected */
  delimiter: string;
};
