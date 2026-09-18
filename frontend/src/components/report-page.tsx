"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PieChart as PieIcon, Upload, Wallet } from "lucide-react";

import { CategoryPie, MonthlyBars } from "@/components/charts";
import ImportWizard from "@/components/import-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Account, type Category, type Dashboard, type Transaction } from "@/lib/api";
import { formatCad } from "@/lib/utils";

export default function ReportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ txn: Transaction; category: string } | null>(null);

  const load = useCallback(async () => {
    setError("");
    const [accts, cats, dash, txns] = await Promise.all([
      api.getAccounts(),
      api.getCategories(),
      api.getDashboard(),
      api.getTransactions({ limit: "500" }),
    ]);
    setAccounts(accts);
    setCategories(cats);
    setDashboard(dash);
    setTransactions(txns);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (txn) =>
        txn.description.toLowerCase().includes(q) ||
        (txn.category || "").toLowerCase().includes(q) ||
        (txn.merchant || "").toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const loadSample = async () => {
    try {
      const result = await api.loadSampleHousehold();
      if (result.already_loaded) {
        toast.message("Sample household is already in the ledger");
      } else {
        toast.success(
          `Loaded ${result.created_transactions} sample transactions across ${result.created_accounts} accounts`,
        );
      }
      await load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const confirmRecategorize = async () => {
    if (!pending) return;
    try {
      const result = await api.recategorizeMerchant({
        pattern: pending.txn.merchant || pending.txn.description,
        category: pending.category,
        save_rule: true,
      });
      toast.success(`Updated ${result.updated_count} transactions and saved a rule`);
      setPending(null);
      await load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const empty = !loading && (dashboard?.transaction_count ?? 0) === 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-serif text-2xl tracking-tight text-pine">Tally</p>
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Spending report · CAD</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadSample}>
              Load sample household
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error} — start Postgres + API with `docker compose up`, then refresh.
          </div>
        )}

        {empty && (
          <Card className="border-dashed">
            <CardHeader className="items-center text-center">
              <Wallet className="mb-2 h-10 w-10 text-pine" />
              <CardTitle className="font-serif text-3xl">Nothing to tally yet</CardTitle>
              <CardDescription className="max-w-lg">
                Upload a bank or credit-card CSV (TD, Amex, Chase, or generic Date/Description/Amount). Transfers
                such as card payments, Zelle, and ATM cash are stored but excluded from spend totals.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center gap-3 pb-8">
              <Button onClick={() => setImportOpen(true)}>Import a statement</Button>
              <Button variant="outline" onClick={loadSample}>
                Explore sample household
              </Button>
            </CardContent>
          </Card>
        )}

        {!empty && dashboard && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Kpi label="Spent" value={formatCad(dashboard.total_spent)} hint="Expenses, transfers excluded" />
              <Kpi label="Income" value={formatCad(dashboard.total_income)} hint="Paycheques and refunds" />
              <Kpi
                label="Net"
                value={formatCad(dashboard.total_net)}
                hint="Income minus spent · CAD"
                emphasize
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieIcon className="h-4 w-4" /> Category mix
                  </CardTitle>
                  <CardDescription>Spend by category. Transfer is excluded.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryPie data={dashboard.by_category} />
                  <ul className="mt-2 space-y-1 text-sm">
                    {dashboard.by_category.slice(0, 6).map((row) => (
                      <li key={row.category} className="flex justify-between">
                        <span>{row.category}</span>
                        <span className="text-stone-500">
                          {formatCad(row.total)} · {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Monthly cash flow</CardTitle>
                  <CardDescription>Spent vs income by month.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MonthlyBars data={dashboard.monthly} />
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Top merchants</CardTitle>
                <CardDescription>Largest expense destinations this ledger.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {dashboard.top_merchants.map((row) => (
                  <div key={row.merchant} className="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{row.merchant}</p>
                      <p className="text-xs text-stone-500">{row.count} transactions</p>
                    </div>
                    <p className="text-sm">{formatCad(row.total)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-end justify-between gap-4">
                <div>
                  <CardTitle>Transactions</CardTitle>
                  <CardDescription>
                    Recategorize a merchant to update matching rows and save a rule.
                  </CardDescription>
                </div>
                <Input
                  placeholder="Search merchant, category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-xs"
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">CAD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap">{txn.transaction_date}</TableCell>
                        <TableCell>
                          <div className="font-medium">{txn.merchant || txn.description}</div>
                          {txn.merchant && txn.merchant !== txn.description && (
                            <div className="text-xs text-stone-500">{txn.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-stone-500">
                          {accounts.find((a) => a.id === txn.account_id)?.name ?? txn.account_id}
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-8 rounded-md border border-stone-300 bg-white px-2 text-xs"
                            value={txn.category ?? "Uncategorized"}
                            onChange={(e) => setPending({ txn, category: e.target.value })}
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.name}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={txn.transaction_type}>{txn.transaction_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCad(txn.amount_cad)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} accounts={accounts} onImported={load} />

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recategorize merchant</DialogTitle>
            <DialogDescription>
              Apply <span className="font-medium">{pending?.category}</span> to every transaction matching{" "}
              <span className="font-medium">{pending?.txn.merchant || pending?.txn.description}</span> and save a
              category rule for future imports.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmRecategorize}>Save rule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-pine/30" : undefined}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-serif text-3xl">{value}</CardTitle>
        <p className="text-xs text-stone-500">{hint}</p>
      </CardHeader>
    </Card>
  );
}
