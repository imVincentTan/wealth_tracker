import { format, parseISO, startOfMonth, subDays, subMonths, startOfYear } from "date-fns";
import { CATEGORY_BY_ID, SPEND_CATEGORIES } from "./categorize";
import { roundMoney, sum } from "./money";
import type { CategoryId, DatePreset, Transaction } from "./types";

export type DateRange = { start: string; end: string } | null;

export function rangeFromPreset(preset: DatePreset, today = new Date()): DateRange {
  if (preset === "all") return null;
  const end = format(today, "yyyy-MM-dd");
  if (preset === "last-30") return { start: format(subDays(today, 29), "yyyy-MM-dd"), end };
  if (preset === "last-90") return { start: format(subDays(today, 89), "yyyy-MM-dd"), end };
  if (preset === "this-month") return { start: format(startOfMonth(today), "yyyy-MM-dd"), end };
  if (preset === "last-month") {
    const last = subMonths(today, 1);
    const start = startOfMonth(last);
    const lastEnd = startOfMonth(today);
    const endDate = new Date(lastEnd);
    endDate.setDate(endDate.getDate() - 1);
    return { start: format(start, "yyyy-MM-dd"), end: format(endDate, "yyyy-MM-dd") };
  }
  if (preset === "this-year") return { start: format(startOfYear(today), "yyyy-MM-dd"), end };
  return null;
}

export function inRange(date: string, range: DateRange): boolean {
  if (!range) return true;
  return date >= range.start && date <= range.end;
}

export type CategoryTotal = {
  id: CategoryId;
  label: string;
  color: string;
  spent: number;
  count: number;
  share: number;
};

export type MonthTotal = {
  month: string;
  label: string;
  spent: number;
  income: number;
};

export type MerchantTotal = {
  merchant: string;
  spent: number;
  count: number;
  category: CategoryId;
};

export type Report = {
  spent: number;
  income: number;
  net: number;
  transferOut: number;
  count: number;
  byCategory: CategoryTotal[];
  byMonth: MonthTotal[];
  byMerchant: MerchantTotal[];
};

export function buildReport(transactions: Transaction[]): Report {
  const operating = transactions.filter((t) => t.category !== "transfers");
  const spendTx = operating.filter((t) => t.amount < 0);
  const refundTx = operating.filter((t) => t.amount > 0 && t.category !== "income");
  const incomeTx = operating.filter((t) => t.category === "income" && t.amount > 0);
  const transferTx = transactions.filter((t) => t.category === "transfers");

  const spent = roundMoney(-sum(spendTx.map((t) => t.amount)) - sum(refundTx.map((t) => t.amount)));
  const income = sum(incomeTx.map((t) => t.amount));
  const net = roundMoney(income - spent);
  const transferOut = -sum(transferTx.filter((t) => t.amount < 0).map((t) => t.amount));

  const spentSafe = spent <= 0 ? 0 : spent;
  const byCategory: CategoryTotal[] = SPEND_CATEGORIES.map((id) => {
    const rows = operating.filter((t) => t.category === id);
    const catSpent = roundMoney(
      -sum(rows.filter((t) => t.amount < 0).map((t) => t.amount)) -
        sum(rows.filter((t) => t.amount > 0).map((t) => t.amount))
    );
    return {
      id,
      label: CATEGORY_BY_ID[id].label,
      color: CATEGORY_BY_ID[id].color,
      spent: catSpent,
      count: rows.length,
      share: spentSafe > 0 ? catSpent / spentSafe : 0,
    };
  })
    .filter((c) => c.spent > 0.004)
    .sort((a, b) => b.spent - a.spent);

  const monthMap = new Map<string, { spent: number; income: number }>();
  for (const t of operating) {
    const month = t.date.slice(0, 7);
    const entry = monthMap.get(month) ?? { spent: 0, income: 0 };
    if (t.category === "income" && t.amount > 0) entry.income += t.amount;
    else if (t.amount < 0) entry.spent += -t.amount;
    else if (t.amount > 0) entry.spent -= t.amount;
    monthMap.set(month, entry);
  }
  const byMonth: MonthTotal[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: format(parseISO(`${month}-01`), "MMM yyyy"),
      spent: roundMoney(v.spent),
      income: roundMoney(v.income),
    }));

  const merchantMap = new Map<string, MerchantTotal>();
  for (const t of spendTx) {
    const key = t.merchant || t.description;
    const entry = merchantMap.get(key) ?? {
      merchant: key,
      spent: 0,
      count: 0,
      category: t.category,
    };
    entry.spent += -t.amount;
    entry.count += 1;
    merchantMap.set(key, entry);
  }
  const byMerchant = [...merchantMap.values()]
    .map((m) => ({ ...m, spent: roundMoney(m.spent) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8);

  return {
    spent: roundMoney(Math.max(0, spent)),
    income,
    net,
    transferOut: roundMoney(transferOut),
    count: transactions.length,
    byCategory,
    byMonth,
    byMerchant,
  };
}

export function formatRangeLabel(range: DateRange, preset: DatePreset): string {
  if (preset === "all" || !range) return "All imported activity";
  const start = format(parseISO(range.start), "MMM d, yyyy");
  const end = format(parseISO(range.end), "MMM d, yyyy");
  return `${start} – ${end}`;
}
