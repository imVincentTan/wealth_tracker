"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categorize";
import { formatMoneySigned } from "@/lib/money";
import { useLedger } from "@/lib/store";
import type { Account, CategoryId, Transaction } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  transactions: Transaction[];
  accounts: Account[];
};

export function TransactionTable({ transactions, accounts }: Props) {
  const setCategory = useLedger((s) => s.setCategory);
  const deleteTransaction = useLedger((s) => s.deleteTransaction);
  const [query, setQuery] = useState("");
  const [category, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [accountId, setAccountId] = useState<string>("all");

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Account";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (accountId !== "all" && t.accountId !== accountId) return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        t.merchant.toLowerCase().includes(q) ||
        CATEGORY_BY_ID[t.category].label.toLowerCase().includes(q)
      );
    });
  }, [transactions, query, category, accountId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants or descriptions"
          className="sm:max-w-xs"
        />
        <select
          value={category}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryId | "all")}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          No transactions match those filters.
        </p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Merchant</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {format(parseISO(t.date), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.merchant}</div>
                      <div className="max-w-md truncate text-xs text-muted-foreground">
                        {t.description}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{accountName(t.accountId)}</td>
                    <td className="px-3 py-2">
                      <CategorySelect
                        value={t.category}
                        onChange={(next) => {
                          void setCategory(t.id, next, true);
                          toast.message(`Set ${t.merchant} to ${CATEGORY_BY_ID[next].label}`, {
                            description: "Future imports of this merchant will use the same category.",
                          });
                        }}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums font-medium",
                        t.amount > 0 && "text-emerald-800"
                      )}
                    >
                      {formatMoneySigned(t.amount)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => void deleteTransaction(t.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {filtered.map((t) => (
              <li key={t.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{t.merchant}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(t.date), "MMM d")} · {accountName(t.accountId)}
                    </p>
                  </div>
                  <p className={cn("tabular-nums font-medium", t.amount > 0 && "text-emerald-800")}>
                    {formatMoneySigned(t.amount)}
                  </p>
                </div>
                <div className="mt-2">
                  <CategorySelect
                    value={t.category}
                    onChange={(next) => {
                      void setCategory(t.id, next, true);
                      toast.message(`Set ${t.merchant} to ${CATEGORY_BY_ID[next].label}`);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (value: CategoryId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CategoryId)}
      className="h-7 max-w-full rounded-md border border-input bg-background px-2 text-xs"
    >
      {CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
