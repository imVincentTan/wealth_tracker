"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Printer,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportDialog } from "@/components/import-dialog";
import { CategoryChart } from "@/components/category-chart";
import { TrendChart } from "@/components/trend-chart";
import { TransactionTable } from "@/components/transaction-table";
import { downloadTextFile, transactionsToCsv } from "@/lib/export";
import { formatMoney, formatMoneySigned } from "@/lib/money";
import { buildReport, formatRangeLabel, inRange, rangeFromPreset } from "@/lib/reports";
import { useLedger } from "@/lib/store";
import { useHasHydrated } from "@/lib/use-has-hydrated";
import type { DatePreset } from "@/lib/types";
import { CATEGORY_BY_ID } from "@/lib/categorize";

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-30", label: "Last 30 days" },
  { id: "last-90", label: "Last 90 days" },
  { id: "this-year", label: "This year" },
];

export function TallyApp() {
  const hydrated = useHasHydrated();
  const transactions = useLedger((s) => s.transactions);
  const accounts = useLedger((s) => s.accounts);
  const loadSample = useLedger((s) => s.loadSample);
  const error = useLedger((s) => s.error);
  const [importOpen, setImportOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("all");
  const [accountId, setAccountId] = useState("all");

  const range = rangeFromPreset(preset);
  const visible = useMemo(
    () =>
      transactions.filter(
        (t) => inRange(t.date, range) && (accountId === "all" || t.accountId === accountId)
      ),
    [transactions, range, accountId]
  );
  const report = useMemo(() => buildReport(visible), [visible]);

  async function onSample() {
    try {
      const result = await loadSample();
      toast.success(
        result.skipped
          ? `Loaded ${result.added} sample transactions (${result.skipped} already present).`
          : `Loaded ${result.added} sample transactions from a checking account and a card.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load sample data.");
    }
  }

  function onExport() {
    downloadTextFile("tally-report.csv", transactionsToCsv(visible, accounts));
    toast.success("Downloaded categorized transactions.");
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Opening your ledger…
      </div>
    );
  }

  const empty = transactions.length === 0;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="font-heading text-2xl leading-none tracking-tight">Tally</p>
            <p className="text-xs text-muted-foreground">Statements in Postgres</p>
          </div>
          {!empty && (
            <>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as DatePreset)}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-8 max-w-40 rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="all">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload data-icon="inline-start" />
            Import CSV
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && empty ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error} Start Postgres and the API, then refresh.
          </p>
        ) : null}
        {empty ? (
          <EmptyState onImport={() => setImportOpen(true)} onSample={onSample} />
        ) : (
          <div className="space-y-6">
            <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Spending report</h1>
                <p className="mt-1 text-muted-foreground">{formatRangeLabel(range, preset)}</p>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download data-icon="inline-start" />
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer data-icon="inline-start" />
                  Print
                </Button>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Spent" value={formatMoney(report.spent, { sign: "never" })} hint="Excludes transfers and card payments" />
              <StatCard label="Income" value={formatMoney(report.income, { sign: "never" })} hint="Paychecks and other money in" />
              <StatCard
                label="Net"
                value={formatMoneySigned(report.net)}
                hint={report.net >= 0 ? "Income covered spending" : "Spent more than came in"}
                tone={report.net >= 0 ? "good" : "warn"}
              />
              <StatCard
                label="Transactions"
                value={String(report.count)}
                hint={
                  report.transferOut
                    ? `${formatMoney(report.transferOut, { sign: "never" })} in transfers omitted`
                    : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`
                }
              />
            </section>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>By category</CardTitle>
                  <CardDescription>Where the money actually went, after refunds.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryChart data={report.byCategory} />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top merchants</CardTitle>
                  <CardDescription>Largest outflows in this range.</CardDescription>
                </CardHeader>
                <CardContent>
                  {report.byMerchant.length === 0 ? (
                    <p className="py-8 text-sm text-muted-foreground">No merchants to rank yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {report.byMerchant.map((m, index) => (
                        <li key={m.merchant} className="flex items-baseline gap-3 text-sm">
                          <span className="w-4 text-muted-foreground">{index + 1}</span>
                          <span className="flex-1 truncate">
                            {m.merchant}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {CATEGORY_BY_ID[m.category].label}
                            </span>
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatMoney(m.spent, { sign: "never" })}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Month by month</CardTitle>
                <CardDescription>Spending in pine, income in paper.</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={report.byMonth} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Every transaction</CardTitle>
                <CardDescription>
                  Recategorize a merchant and Tally remembers it for the next import.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionTable transactions={visible} accounts={accounts} />
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "warn";
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            tone === "good"
              ? "text-2xl tabular-nums text-emerald-800"
              : tone === "warn"
                ? "text-2xl tabular-nums text-destructive"
                : "text-2xl tabular-nums"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function EmptyState({ onImport, onSample }: { onImport: () => void; onSample: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center sm:py-16">
      <p className="text-sm font-medium tracking-wide text-emerald-800 uppercase">Local only</p>
      <h1 className="font-heading mt-3 text-4xl tracking-tight sm:text-6xl">
        Statements in. A spending report out.
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
        Drop CSVs from a checking account or credit card. Tally stores the original
        rows in Postgres, categorizes them, and never needs a cloud login.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" onClick={onImport}>
          <Upload data-icon="inline-start" />
          Import a CSV
        </Button>
        <Button size="lg" variant="outline" onClick={onSample}>
          Try a sample household
        </Button>
      </div>
      <ul className="mx-auto mt-12 grid gap-4 text-left sm:grid-cols-3">
        <li className="rounded-xl border bg-card p-4">
          <p className="font-medium">Knows bank layouts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Chase, Amex, Capital One, Bank of America, or any Date / Description / Amount export.
          </p>
        </li>
        <li className="rounded-xl border bg-card p-4">
          <p className="font-medium">Categorizes as it goes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Groceries, dining, rent, and card payments are split so totals are not inflated.
          </p>
        </li>
        <li className="rounded-xl border bg-card p-4">
          <p className="font-medium">You stay in control</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fix a category once and Tally saves a merchant rule. Print or export when you need it.
          </p>
        </li>
      </ul>
    </div>
  );
}
