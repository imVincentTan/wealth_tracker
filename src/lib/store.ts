import { create } from "zustand";
import {
  api,
  categoryFromApi,
  CATEGORY_TO_API,
  institutionFromName,
  kindFromApi,
  kindToApi,
  parserConfigFromMapping,
  type ApiAccount,
  type ApiTransaction,
} from "./api";
import { CHASE_CHECKING_CSV, CHASE_CREDIT_CSV } from "./sample";
import type {
  Account,
  AccountKind,
  CategoryId,
  ColumnMapping,
  PortfolioAccount,
  PortfolioKind,
  PortfolioSummary,
  Transaction,
} from "./types";

type ImportResult = {
  added: number;
  skipped: number;
  accountId: string;
  importTrace: Record<string, unknown> | null;
};

type LedgerState = {
  ready: boolean;
  error: string | null;
  transactions: Transaction[];
  accounts: Account[];
  portfolio: PortfolioAccount[];
  assetsTotal: number;
  debtsTotal: number;
  netWorth: number;
  refresh: () => Promise<void>;
  createPortfolio: (body: {
    name: string;
    kind: PortfolioKind;
    institution?: string;
    purchase_date?: string;
    purchase_price?: number;
    linked_property_id?: number;
    balance?: number;
  }) => Promise<PortfolioAccount>;
  updatePortfolio: (
    id: number,
    body: {
      name?: string;
      purchase_date?: string;
      purchase_price?: number;
      linked_property_id?: number | null;
      balance?: number;
    }
  ) => Promise<void>;
  addHolding: (id: number, body: { name: string; quantity: number; price_cad: number }) => Promise<void>;
  updateHolding: (
    id: number,
    holdingId: number,
    body: { name: string; quantity: number; price_cad: number }
  ) => Promise<void>;
  deleteHolding: (id: number, holdingId: number) => Promise<void>;
  importFile: (args: {
    file: File;
    name: string;
    kind: AccountKind;
    mapping: ColumnMapping;
    invertAmounts: boolean;
    delimiter?: string;
    headerRow?: number;
    clientPreviewRowCount?: number;
  }) => Promise<ImportResult>;
  loadSample: () => Promise<ImportResult>;
  setCategory: (id: string, category: CategoryId, applyToMerchant: boolean) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteImport: (id: number) => Promise<{ filename: string; deleted_transactions: number }>;
  renameAccount: (id: string, name: string) => Promise<void>;
};

function mapAccount(account: ApiAccount): Account {
  return {
    id: String(account.id),
    name: account.name,
    kind: kindFromApi(account.account_type),
    parserConfig: account.parser_config ?? {},
  };
}

function applyPortfolio(
  set: (partial: Partial<LedgerState>) => void,
  portfolio: PortfolioSummary
) {
  set({
    portfolio: portfolio.accounts,
    assetsTotal: portfolio.assets_total,
    debtsTotal: portfolio.debts_total,
    netWorth: portfolio.net,
  });
}

function mapTransaction(txn: ApiTransaction): Transaction {
  return {
    id: String(txn.id),
    date: txn.transaction_date,
    description: txn.description,
    merchant: txn.merchant || txn.description,
    amount: Number(txn.amount_cad ?? txn.amount),
    category: categoryFromApi(txn.category),
    accountId: String(txn.account_id),
    sourceFile: "",
    fingerprint: String(txn.id),
  };
}

async function ensureAccount(
  name: string,
  kind: AccountKind,
  mapping: ColumnMapping,
  invertAmounts: boolean,
  existing: Account[],
  parseExtras: { delimiter?: string; headerRow?: number } = {}
): Promise<number> {
  const found = existing.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const parser_config = parserConfigFromMapping(mapping, invertAmounts, parseExtras);
  if (found) {
    await api.updateAccount(Number(found.id), { parser_config });
    return Number(found.id);
  }
  const created = await api.createAccount({
    name,
    institution: institutionFromName(name),
    account_type: kindToApi(kind),
    currency: "CAD",
    parser_config,
  });
  return created.id;
}

export const useLedger = create<LedgerState>((set, get) => ({
  ready: false,
  error: null,
  transactions: [],
  accounts: [],
  portfolio: [],
  assetsTotal: 0,
  debtsTotal: 0,
  netWorth: 0,
  refresh: async () => {
    try {
      const [accounts, transactions, portfolio] = await Promise.all([
        api.getAccounts(),
        api.getTransactions(),
        api.getPortfolio(),
      ]);
      applyPortfolio(set, portfolio);
      set({
        accounts: accounts.map(mapAccount),
        transactions: transactions.map(mapTransaction),
        ready: true,
        error: null,
      });
    } catch (error) {
      set({
        ready: true,
        error: error instanceof Error ? error.message : "Could not reach the API",
      });
    }
  },
  createPortfolio: async (body) => {
    const created = await api.createPortfolio(body);
    await get().refresh();
    return created;
  },
  updatePortfolio: async (id, body) => {
    await api.updatePortfolio(id, body);
    await get().refresh();
  },
  addHolding: async (id, body) => {
    await api.addHolding(id, body);
    await get().refresh();
  },
  updateHolding: async (id, holdingId, body) => {
    await api.updateHolding(id, holdingId, body);
    await get().refresh();
  },
  deleteHolding: async (id, holdingId) => {
    await api.deleteHolding(id, holdingId);
    await get().refresh();
  },
  importFile: async ({
    file,
    name,
    kind,
    mapping,
    invertAmounts,
    delimiter,
    headerRow,
    clientPreviewRowCount,
  }) => {
    const accountId = await ensureAccount(name, kind, mapping, invertAmounts, get().accounts, {
      delimiter,
      headerRow,
    });
    const preview = await api.previewImport(accountId, file, { clientPreviewRowCount });
    const committed = await api.commitImport(preview.import_id);
    await get().refresh();
    const importTrace = {
      ...(committed.import_trace ?? preview.import_trace ?? {}),
      ...(clientPreviewRowCount != null ? { client_preview_row_count: clientPreviewRowCount } : {}),
    };
    return {
      added: committed.committed_count,
      skipped: committed.skipped_duplicates,
      accountId: String(accountId),
      importTrace: Object.keys(importTrace).length ? importTrace : null,
    };
  },
  loadSample: async () => {
    const checking = new File([CHASE_CHECKING_CSV], "chase-checking.csv", { type: "text/csv" });
    const card = new File([CHASE_CREDIT_CSV], "chase-credit.csv", { type: "text/csv" });
    const first = await get().importFile({
      file: checking,
      name: "Chase Checking",
      kind: "checking",
      mapping: {
        date: "Posting Date",
        description: "Description",
        amount: "Amount",
        debit: null,
        credit: null,
        category: null,
        type: "Details",
        balance: "Balance",
      },
      invertAmounts: false,
    });
    const second = await get().importFile({
      file: card,
      name: "Chase Sapphire",
      kind: "credit",
      mapping: {
        date: "Transaction Date",
        description: "Description",
        amount: "Amount",
        debit: null,
        credit: null,
        category: "Category",
        type: "Type",
        balance: "Balance",
      },
      invertAmounts: false,
    });
    return {
      added: first.added + second.added,
      skipped: first.skipped + second.skipped,
      accountId: second.accountId,
      importTrace: second.importTrace,
    };
  },
  setCategory: async (id, category, applyToMerchant) => {
    await api.updateTransaction(Number(id), {
      category: CATEGORY_TO_API[category],
      apply_to_merchant: applyToMerchant,
    });
    await get().refresh();
  },
  deleteTransaction: async (id) => {
    await api.deleteTransaction(Number(id));
    await get().refresh();
  },
  deleteImport: async (id) => {
    const result = await api.deleteImport(id);
    await get().refresh();
    return { filename: result.filename, deleted_transactions: result.deleted_transactions };
  },
  renameAccount: async (id, name) => {
    await api.updateAccount(Number(id), { name });
    await get().refresh();
  },
}));
