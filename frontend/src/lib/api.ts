const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ? JSON.stringify(body.detail) : JSON.stringify(body);
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* keep statusText */
      }
    }
    throw new Error(detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Institution = "td" | "amex" | "chase" | "other";
export type AccountType = "chequing" | "savings" | "credit_card";
export type TransactionType = "income" | "expense" | "transfer";

export type Account = {
  id: number;
  name: string;
  institution: Institution;
  account_type: AccountType;
  currency: string;
  parser_config: Record<string, unknown>;
};

export type Category = {
  id: number;
  name: string;
  is_default: boolean;
  exclude_from_charts: boolean;
};

export type Transaction = {
  id: number;
  account_id: number;
  transaction_date: string;
  amount: number;
  currency: string;
  amount_cad: number;
  description: string;
  merchant: string | null;
  category: string | null;
  transaction_type: TransactionType;
};

export type Dashboard = {
  monthly: { month: string; income: number; expenses: number; net: number }[];
  by_category: { category: string; total: number; count: number }[];
  top_merchants: { merchant: string; total: number; count: number }[];
  total_income: number;
  total_expenses: number;
  total_spent: number;
  total_net: number;
  transaction_count: number;
};

export type DetectResult = {
  filename: string;
  headers: string[];
  sample_rows: Record<string, string>[];
  institution: Institution | null;
  account_type: AccountType | null;
  parser_config: Record<string, unknown>;
  confidence: string;
  notes: string;
};

export type ImportPreview = {
  import_id: number;
  filename: string;
  account_id: number;
  headers: string[];
  parser_config: Record<string, unknown>;
  transactions: {
    transaction_date: string;
    amount: number;
    description: string;
    merchant?: string | null;
    category: string | null;
    transaction_type: TransactionType;
    dedup_hash?: string;
    is_duplicate: boolean;
  }[];
  skipped_duplicates: number;
};

export const api = {
  health: () => request<{ status: string }>("/health"),
  getAccounts: () => request<Account[]>("/accounts"),
  createAccount: (body: {
    name: string;
    institution: Institution;
    account_type: AccountType;
    currency?: string;
    parser_config?: Record<string, unknown>;
  }) =>
    request<Account>("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateAccount: (id: number, body: { parser_config?: Record<string, unknown>; name?: string }) =>
    request<Account>(`/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getCategories: () => request<Category[]>("/categories"),
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : "";
    return request<Transaction[]>(`/transactions${qs}`);
  },
  getDashboard: () => request<Dashboard>("/dashboard"),
  detectCsv: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DetectResult>("/imports/detect", { method: "POST", body: form });
  },
  previewImport: async (
    accountId: number,
    file: File,
    parserConfig?: Record<string, unknown>,
    saveMapping = true,
  ) => {
    const form = new FormData();
    form.append("account_id", String(accountId));
    form.append("file", file);
    form.append("save_mapping", saveMapping ? "true" : "false");
    if (parserConfig) form.append("parser_config", JSON.stringify(parserConfig));
    return request<ImportPreview>("/imports/preview", { method: "POST", body: form });
  },
  commitImport: (importId: number) =>
    request<{ committed_count: number; skipped_duplicates: number }>(
      `/imports/${importId}/commit`,
      { method: "POST" },
    ),
  recategorizeMerchant: (body: { pattern: string; category: string; save_rule?: boolean }) =>
    request<{ updated_count: number; rule_id: number | null; category: string }>(
      "/transactions/recategorize-merchant",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
  loadSampleHousehold: (force = false) =>
    request<{ created_accounts: number; created_transactions: number; already_loaded: boolean }>(
      `/sample-household${force ? "?force=true" : ""}`,
      { method: "POST" },
    ),
};
