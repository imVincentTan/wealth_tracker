import type { Account, Transaction } from "./types";
import { CATEGORY_BY_ID } from "./categorize";

export function transactionsToCsv(transactions: Transaction[], accounts: Account[]): string {
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const header = ["Date", "Account", "Description", "Merchant", "Category", "Amount"];
  const lines = transactions.map((t) =>
    [
      t.date,
      csvCell(accountName(t.accountId)),
      csvCell(t.description),
      csvCell(t.merchant),
      csvCell(CATEGORY_BY_ID[t.category].label),
      t.amount.toFixed(2),
    ].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
