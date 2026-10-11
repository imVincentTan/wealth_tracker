import type { AccountKind, CategoryId, ColumnMapping } from "./types";

// Same-origin by default (single-server bundle: FastAPI serves UI + /api).
// Set NEXT_PUBLIC_API_URL to the API origin only for the split dev setup
// (next dev on :43127 talking to uvicorn on :8000).
const origin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
export const API_URL = origin ? `${origin}/api` : "/api";

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

export type ApiImport = {
  id: number;
  account_id: number;
  filename: string;
  status: "preview" | "committed" | "failed";
  row_count: number;
  created_at: string;
  // Archive path relative to the backend data dir, or null if not archived.
  raw_file: string | null;
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
  invertAmounts: boolean,
  extras: { delimiter?: string; headerRow?: number } = {}
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    date_column: mapping.date,
    description_column: mapping.description,
    invert_sign: invertAmounts,
    date_format: "%m/%d/%Y",
    header_row: extras.headerRow ?? 1,
  };
  if (extras.delimiter) config.delimiter = extras.delimiter;
  if (mapping.debit || mapping.credit) {
    config.amount_mode = "debit_credit";
    config.debit_column = mapping.debit;
    config.credit_column = mapping.credit;
  } else {
    config.amount_mode = "signed";
    config.amount_column = mapping.amount;
  }
  if (mapping.type) config.type_column = mapping.type;
  // Recorded for completeness; the parser never reads these, so a balance or
  // bank-category column can never leak into amounts at commit time.
  if (mapping.balance) config.balance_column = mapping.balance;
  if (mapping.category) config.category_column = mapping.category;
  return config;
}

function configString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === "string" && value ? value : null;
}

export function mappingFromParserConfig(config: Record<string, unknown> | null | undefined): ColumnMapping {
  const c = config ?? {};
  return {
    date: configString(c, "date_column"),
    description: configString(c, "description_column"),
    amount: configString(c, "amount_column"),
    debit: configString(c, "debit_column"),
    credit: configString(c, "credit_column"),
    category: configString(c, "category_column"),
    type: configString(c, "type_column"),
    balance: configString(c, "balance_column"),
  };
}

/** Overlay a saved mapping onto the current file's headers. Saved roles whose
 *  headers exist win (and evict conflicting auto-detect roles); missing headers
 *  keep the auto-detect fallback. Amount vs debit/credit is exclusive: a saved
 *  debit/credit mapping clears auto amount (and the reverse), even when the
 *  unused role was stored as null. */
export function overlayMapping(headers: string[], auto: ColumnMapping, saved: ColumnMapping): ColumnMapping {
  const next = { ...auto };
  for (const [role, header] of Object.entries(saved) as [keyof ColumnMapping, string | null][]) {
    if (!header || !headers.includes(header)) continue;
    for (const key of Object.keys(next) as (keyof ColumnMapping)[]) {
      if (next[key] === header) next[key] = null;
    }
    next[role] = header;
  }
  const savedDebitCredit =
    (saved.debit != null && next.debit === saved.debit) ||
    (saved.credit != null && next.credit === saved.credit);
  const savedAmount = saved.amount != null && next.amount === saved.amount;
  if (savedDebitCredit) next.amount = null;
  if (savedAmount) {
    next.debit = null;
    next.credit = null;
  }
  return next;
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
  getImports: () => request<ApiImport[]>("/imports"),
  deleteImport: (id: number) =>
    request<{ import_id: number; filename: string; deleted_transactions: number }>(
      `/imports/${id}`,
      { method: "DELETE" }
    ),
  renameImport: (id: number, filename: string) =>
    request<ApiImport>(`/imports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    }),
  previewImport: async (
    accountId: number,
    file: File,
    extras: { clientPreviewRowCount?: number } = {}
  ) => {
    const form = new FormData();
    form.append("account_id", String(accountId));
    form.append("file", file);
    if (extras.clientPreviewRowCount != null) {
      form.append("client_preview_row_count", String(extras.clientPreviewRowCount));
    }
    return request<{
      import_id: number;
      skipped_duplicates: number;
      transactions: unknown[];
      import_trace?: Record<string, unknown>;
    }>("/imports/preview", { method: "POST", body: form });
  },
  commitImport: (importId: number) =>
    request<{
      committed_count: number;
      skipped_duplicates: number;
      import_trace?: Record<string, unknown>;
    }>(`/imports/${importId}/commit`, { method: "POST" }),
  getLastImportTrace: async () => {
    const res = await fetch(`${API_URL}/imports/last-trace`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || res.statusText);
    }
    return res.json() as Promise<Record<string, unknown>>;
  },
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
