import Papa from "papaparse";
import { categorize, extractMerchant } from "./categorize";
import { parseMoney } from "./money";
import type {
  AccountKind,
  CategoryId,
  ColumnMapping,
  ImportPreview,
  Transaction,
} from "./types";

const DATE_HEADERS = [
  "transaction date",
  "trans date",
  "txn date",
  "posted date",
  "posting date",
  "post date",
  "date",
  "trans. date",
];
const DESCRIPTION_HEADERS = [
  "description",
  "payee",
  "merchant",
  "name",
  "original description",
  "memo",
  "transaction",
];
const AMOUNT_HEADERS = ["amount", "transaction amount", "amt", "value"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals"];
const CREDIT_HEADERS = ["credit", "deposit", "deposits"];
const CATEGORY_HEADERS = ["category"];
const TYPE_HEADERS = ["type", "details", "transaction type", "cr/dr", "status"];

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, key: normHeader(h) }));
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.key === alias);
    if (hit) return hit.raw;
  }
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.key.includes(alias));
    if (hit) return hit.raw;
  }
  return null;
}

export function looksLikeHeader(line: string): boolean {
  const lower = line.toLowerCase();
  const hasDate = /\bdate\b/.test(lower);
  const hasAmount = /\bamount\b/.test(lower) || /\bdebit\b/.test(lower) || /\bcredit\b/.test(lower);
  return hasDate && hasAmount;
}

export function extractCsvBody(text: string): string {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/);
  const idx = lines.findIndex((line) => looksLikeHeader(line));
  if (idx <= 0) return cleaned;
  return lines.slice(idx).join("\n");
}

function detectFormat(headers: string[], fileName: string): {
  formatName: string;
  confidence: ImportPreview["confidence"];
  kind: AccountKind;
} {
  const keys = headers.map(normHeader).join(" | ");
  const name = fileName.toLowerCase();

  if (keys.includes("card member") || name.includes("amex") || name.includes("american express")) {
    return { formatName: "American Express", confidence: "high", kind: "credit" };
  }
  if (keys.includes("transaction date") && keys.includes("post date") && keys.includes("type")) {
    const kind: AccountKind = name.includes("check") ? "checking" : "credit";
    return { formatName: "Chase credit card", confidence: "high", kind };
  }
  if (keys.includes("details") && keys.includes("posting date") && keys.includes("balance")) {
    return { formatName: "Chase checking / savings", confidence: "high", kind: "checking" };
  }
  if (keys.includes("debit") && keys.includes("credit") && keys.includes("card no")) {
    return { formatName: "Capital One", confidence: "high", kind: "credit" };
  }
  if (keys.includes("posted date") && keys.includes("reference number") && keys.includes("payee")) {
    return { formatName: "Bank of America", confidence: "high", kind: "credit" };
  }
  if (keys.includes("trans date") && keys.includes("post date")) {
    return { formatName: "Discover", confidence: "high", kind: "credit" };
  }
  if (keys.includes("original description") && keys.includes("transaction type") && keys.includes("account name")) {
    return { formatName: "Mint / generic export", confidence: "high", kind: "other" };
  }
  if (pickHeader(headers, DATE_HEADERS) && (pickHeader(headers, AMOUNT_HEADERS) || pickHeader(headers, DEBIT_HEADERS))) {
    const kind: AccountKind = name.includes("credit") || name.includes("card")
      ? "credit"
      : name.includes("sav")
        ? "savings"
        : "checking";
    return { formatName: "Generic CSV", confidence: "medium", kind };
  }
  return { formatName: "Unknown CSV", confidence: "low", kind: "checking" };
}

function suggestedAccountName(fileName: string, kind: AccountKind, formatName: string): string {
  const base = fileName.replace(/\.(csv|tsv|txt)$/i, "").replace(/[_-]+/g, " ").trim();
  if (base && base.toLowerCase() !== "download" && base.length > 2) {
    return toTitle(base);
  }
  const kindLabel = kind === "credit" ? "Credit card" : kind === "savings" ? "Savings" : "Checking";
  if (formatName !== "Generic CSV" && formatName !== "Unknown CSV") {
    return `${formatName} ${kindLabel}`;
  }
  return kindLabel;
}

function toTitle(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildMapping(headers: string[]): ColumnMapping {
  const description = pickHeader(headers, DESCRIPTION_HEADERS);
  const details = pickHeader(headers, ["details"]);
  return {
    date: pickHeader(headers, DATE_HEADERS),
    description: description ?? (details && !pickHeader(headers, ["type"]) ? details : null),
    amount: pickHeader(headers, AMOUNT_HEADERS),
    debit: pickHeader(headers, DEBIT_HEADERS),
    credit: pickHeader(headers, CREDIT_HEADERS),
    category: pickHeader(headers, CATEGORY_HEADERS),
    type: pickHeader(headers, TYPE_HEADERS),
  };
}

export function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (mdy) {
    const month = mdy[1].padStart(2, "0");
    const day = mdy[2].padStart(2, "0");
    let year = mdy[3];
    if (year.length === 2) year = Number(year) > 70 ? `19${year}` : `20${year}`;
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${month}-${day}`;
  }

  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidYmd(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function applyTypeSign(amount: number, typeValue: string | undefined): number {
  if (!typeValue) return amount;
  const t = typeValue.toLowerCase();
  const debitLike = /\b(debit|withdrawal|sale|purchase|charge|fee)\b/.test(t) || t === "debit";
  const creditLike = /\b(credit|deposit|payment|refund|return|interest)\b/.test(t) || t === "credit";
  if (debitLike && amount > 0) return -amount;
  if (creditLike && amount < 0) return -amount;
  return amount;
}

function shouldInvert(kind: AccountKind, formatName: string, amounts: number[], hasSplitColumns: boolean): boolean {
  if (hasSplitColumns) return false;
  if (formatName === "American Express") return true;
  const signed = amounts.filter((n) => n !== 0);
  if (signed.length === 0) return false;
  const positive = signed.filter((n) => n > 0).length;
  const ratio = positive / signed.length;
  if (kind === "credit" && ratio > 0.7) return true;
  return false;
}

export function parseCsvText(text: string, fileName: string): ImportPreview {
  const body = extractCsvBody(text);
  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows = (parsed.data ?? []).filter((row) =>
    Object.values(row).some((v) => String(v ?? "").trim() !== "")
  );
  const mapping = buildMapping(headers);
  const detailsHeader = pickHeader(headers, ["details"]);
  if (detailsHeader) {
    const sample = rows.slice(0, 20).map((row) => (row[detailsHeader] ?? "").toLowerCase().trim());
    if (sample.some((value) => value === "debit" || value === "credit")) {
      mapping.type = detailsHeader;
    }
  }
  const detected = detectFormat(headers, fileName);

  const sampleAmounts: number[] = [];
  for (const row of rows.slice(0, 40)) {
    const amount = amountFromRow(row, mapping, false);
    if (amount != null) sampleAmounts.push(amount);
  }
  const invertAmounts = shouldInvert(
    detected.kind,
    detected.formatName,
    sampleAmounts,
    Boolean(mapping.debit || mapping.credit)
  );

  return {
    formatName: detected.formatName,
    confidence: mapping.date && (mapping.amount || mapping.debit || mapping.credit) && mapping.description
      ? detected.confidence
      : "low",
    headers,
    rows,
    mapping,
    suggestedKind: detected.kind,
    suggestedName: suggestedAccountName(fileName, detected.kind, detected.formatName),
    invertAmounts,
    fileName,
  };
}

export function amountFromRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  invert: boolean
): number | null {
  if (mapping.debit || mapping.credit) {
    const debit = parseMoney(mapping.debit ? row[mapping.debit] : "") ?? 0;
    const credit = parseMoney(mapping.credit ? row[mapping.credit] : "") ?? 0;
    if (!mapping.debit && !mapping.credit) return null;
    if (debit === 0 && credit === 0) {
      const fallback = mapping.amount ? parseMoney(row[mapping.amount]) : null;
      if (fallback == null) return null;
      return invert ? -fallback : fallback;
    }
    return credit - debit;
  }
  if (!mapping.amount) return null;
  const amount = parseMoney(row[mapping.amount]);
  if (amount == null) return null;
  const typed = applyTypeSign(amount, mapping.type ? row[mapping.type] : undefined);
  return invert ? -typed : typed;
}

export function accountIdFromName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `acc_${slug || "account"}`;
}

export function fingerprintOf(date: string, amount: number, description: string, accountId: string): string {
  const desc = description.toLowerCase().replace(/\s+/g, " ").trim();
  return `${accountId}|${date}|${amount.toFixed(2)}|${desc}`;
}

export function rowsToTransactions(
  preview: ImportPreview,
  options: {
    accountId: string;
    mapping: ColumnMapping;
    invertAmounts: boolean;
    learned?: Record<string, CategoryId>;
  }
): Transaction[] {
  const transactions: Transaction[] = [];
  for (const row of preview.rows) {
    const date = parseDate(options.mapping.date ? row[options.mapping.date] : undefined);
    const description = (options.mapping.description ? row[options.mapping.description] : "")?.trim();
    const amount = amountFromRow(row, options.mapping, options.invertAmounts);
    if (!date || !description || amount == null || amount === 0) continue;

    const merchant = extractMerchant(description);
    const bankCategory = options.mapping.category ? row[options.mapping.category]?.trim() : undefined;
    const category = categorize({
      description,
      merchant,
      amount,
      bankCategory,
      learned: options.learned,
    });
    const fingerprint = fingerprintOf(date, amount, description, options.accountId);
    transactions.push({
      id: fingerprint,
      date,
      description,
      merchant,
      amount,
      category,
      accountId: options.accountId,
      sourceFile: preview.fileName,
      fingerprint,
      bankCategory: bankCategory || undefined,
    });
  }
  return transactions.sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
}
