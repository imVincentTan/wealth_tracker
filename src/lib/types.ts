export const ACCOUNT_KINDS = ["checking", "credit", "savings", "other"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

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
};
