const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || res.statusText);
  }
  return res.json();
}

export type Account = {
  id: number;
  name: string;
  institution: "td" | "amex";
  account_type: "chequing" | "savings" | "credit_card";
  currency: string;
};

export type Transaction = {
  id: number;
  account_id: number;
  transaction_date: string;
  amount: number;
  currency: string;
  amount_cad: number;
  description: string;
  category: string | null;
  transaction_type: "income" | "expense" | "transfer";
};

export type Dashboard = {
  monthly: { month: string; income: number; expenses: number; net: number }[];
  by_category: { category: string; total: number; count: number }[];
  total_income: number;
  total_expenses: number;
};

export type ImportPreview = {
  import_id: number;
  filename: string;
  account_id: number;
  transactions: {
    transaction_date: string;
    amount: number;
    description: string;
    category: string | null;
    is_duplicate: boolean;
  }[];
  skipped_duplicates: number;
};

export const api = {
  getAccounts: () => request<Account[]>("/accounts"),
  createAccount: (body: {
    name: string;
    institution: string;
    account_type: string;
    currency?: string;
  }) =>
    request<Account>("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getTransactions: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : "";
    return request<Transaction[]>(`/transactions${qs}`);
  },
  getDashboard: (exclude: string[] = []) => {
    const qs = exclude.length
      ? `?${exclude.map((c) => `exclude_categories=${encodeURIComponent(c)}`).join("&")}`
      : "";
    return request<Dashboard>(`/dashboard${qs}`);
  },
  previewImport: async (accountId: number, file: File) => {
    const form = new FormData();
    form.append("account_id", String(accountId));
    form.append("file", file);
    return request<ImportPreview>("/imports/preview", { method: "POST", body: form });
  },
  commitImport: (importId: number) =>
    request<{ committed_count: number; skipped_duplicates: number }>(
      `/imports/${importId}/commit`,
      { method: "POST" }
    ),
  updateTransaction: (id: number, body: { category?: string }) =>
    request<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getCategories: () =>
    request<{ id: number; name: string; exclude_from_charts: boolean }[]>("/categories"),
};
