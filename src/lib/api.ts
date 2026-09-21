import type { AccountKind, CategoryId, ColumnMapping } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type ApiAccount = {
  id: number;
  name: string;
  institution: "td" | "amex" | "chase" | "other";
  account_type: "chequing" | "savings" | "credit_card";
  currency: string;
  parser_config: Record<string, unknown>;
};

export type ApiTransaction = {
  id: number;
  account_id: number;
  transaction_date: string;
  amount: number;
  currency: string;
  amount_cad: number;
  description: string;
  merchant?: string | null;
  category: string | null;
  transaction_type: "income" | "expense" | "transfer";
};

export const CATEGORY_TO_API: Record<CategoryId, string> = {
  groceries: "Groceries",
  dining: "Dining",
  transport: "Transport",
  housing: "Housing",
  utilities: "Utilities",
  shopping: "Shopping",
  entertainment: "Entertainment",
  healthcare: "Healthcare",
  travel: "Travel",
  subscriptions: "Subscriptions",
  personal: "Personal",
  income: "Income",
  transfers: "Transfer",
  fees: "Fees",
  other: "Other",
};

const CATEGORY_FROM_API: Record<string, CategoryId> = Object.fromEntries(
  Object.entries(CATEGORY_TO_API).map(([id, name]) => [name.toLowerCase(), id as CategoryId])
) as Record<string, CategoryId>;
CATEGORY_FROM_API.health = "healthcare";
CATEGORY_FROM_API.transfers = "transfers";
CATEGORY_FROM_API.uncategorized = "other";

export function categoryFromApi(name: string | null | undefined): CategoryId {
  if (!name) return "other";
  return CATEGORY_FROM_API[name.toLowerCase()] ?? "other";
}

export function kindFromApi(type: ApiAccount["account_type"]): AccountKind {
  if (type === "credit_card") return "credit";
  if (type === "savings") return "savings";
  return "checking";
}

export function kindToApi(kind: AccountKind): ApiAccount["account_type"] {
  if (kind === "credit") return "credit_card";
  if (kind === "savings") return "savings";
  return "chequing";
}

export function institutionFromName(name: string): ApiAccount["institution"] {
  const n = name.toLowerCase();
  if (n.includes("td")) return "td";
  if (n.includes("amex") || n.includes("american express")) return "amex";
  if (n.includes("chase")) return "chase";
  return "other";
}

export function parserConfigFromMapping(
  mapping: ColumnMapping,
  invertAmounts: boolean
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    date_column: mapping.date,
    description_column: mapping.description,
    invert_sign: invertAmounts,
    date_format: "%m/%d/%Y",
  };
  if (mapping.debit || mapping.credit) {
    config.amount_mode = "debit_credit";
    config.debit_column = mapping.debit;
    config.credit_column = mapping.credit;
  } else {
    config.amount_mode = "signed";
    config.amount_column = mapping.amount;
  }
  if (mapping.type) config.type_column = mapping.type;
  return config;
}

export const api = {
  getAccounts: () => request<ApiAccount[]>("/accounts"),
  createAccount: (body: {
    name: string;
    institution: string;
    account_type: string;
    currency?: string;
    parser_config?: Record<string, unknown>;
  }) =>
    request<ApiAccount>("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateAccount: (id: number, body: { name?: string; parser_config?: Record<string, unknown> }) =>
    request<ApiAccount>(`/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getTransactions: () => request<ApiTransaction[]>("/transactions?limit=5000"),
  previewImport: async (accountId: number, file: File) => {
    const form = new FormData();
    form.append("account_id", String(accountId));
    form.append("file", file);
    return request<{ import_id: number; skipped_duplicates: number; transactions: unknown[] }>(
      "/imports/preview",
      { method: "POST", body: form }
    );
  },
  commitImport: (importId: number) =>
    request<{ committed_count: number; skipped_duplicates: number }>(
      `/imports/${importId}/commit`,
      { method: "POST" }
    ),
  updateTransaction: (id: number, body: { category?: string; apply_to_merchant?: boolean }) =>
    request<ApiTransaction>(`/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteTransaction: (id: number) =>
    request<void>(`/transactions/${id}`, { method: "DELETE" }),
  health: () => request<{ status: string }>("/health"),
};
