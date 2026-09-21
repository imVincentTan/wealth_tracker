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
import type { Account, AccountKind, CategoryId, ColumnMapping, Transaction } from "./types";

type ImportResult = { added: number; skipped: number; accountId: string };

type LedgerState = {
  ready: boolean;
  error: string | null;
  transactions: Transaction[];
  accounts: Account[];
  refresh: () => Promise<void>;
  importFile: (args: {
    file: File;
    name: string;
    kind: AccountKind;
    mapping: ColumnMapping;
    invertAmounts: boolean;
  }) => Promise<ImportResult>;
  loadSample: () => Promise<ImportResult>;
  setCategory: (id: string, category: CategoryId, applyToMerchant: boolean) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
};

function mapAccount(account: ApiAccount): Account {
  return {
    id: String(account.id),
    name: account.name,
    kind: kindFromApi(account.account_type),
  };
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
  existing: Account[]
): Promise<number> {
  const found = existing.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const parser_config = parserConfigFromMapping(mapping, invertAmounts);
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
  refresh: async () => {
    try {
      const [accounts, transactions] = await Promise.all([api.getAccounts(), api.getTransactions()]);
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
  importFile: async ({ file, name, kind, mapping, invertAmounts }) => {
    const accountId = await ensureAccount(name, kind, mapping, invertAmounts, get().accounts);
    const preview = await api.previewImport(accountId, file);
    const committed = await api.commitImport(preview.import_id);
    await get().refresh();
    return {
      added: committed.committed_count,
      skipped: committed.skipped_duplicates,
      accountId: String(accountId),
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
      },
      invertAmounts: false,
    });
    return {
      added: first.added + second.added,
      skipped: first.skipped + second.skipped,
      accountId: second.accountId,
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
}));
