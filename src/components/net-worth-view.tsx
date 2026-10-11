"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneySigned } from "@/lib/money";
import { PORTFOLIO_KIND_LABEL } from "@/lib/portfolio";
import { useLedger } from "@/lib/store";
import type { PortfolioAccount } from "@/lib/types";

export function NetWorthView() {
  const portfolio = useLedger((s) => s.portfolio);
  const assetsTotal = useLedger((s) => s.assetsTotal);
  const debtsTotal = useLedger((s) => s.debtsTotal);
  const netWorth = useLedger((s) => s.netWorth);
  const assets = portfolio.filter((a) => a.side === "asset");
  const debts = portfolio.filter((a) => a.side === "debt");

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Net worth</h1>
        <p className="mt-1 text-muted-foreground">Today. No live prices — values are what you typed or imported.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Assets" value={formatMoney(assetsTotal, { sign: "never" })} />
        <Stat label="Debts" value={formatMoney(debtsTotal, { sign: "never" })} />
        <Stat
          label="Net"
          value={formatMoneySigned(netWorth)}
          tone={netWorth >= 0 ? "good" : "warn"}
        />
      </section>

      {portfolio.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add accounts first. Chequing, cards, investments, property, and loans all land here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bucket title="Assets" rows={assets} empty="No assets yet." />
          <Bucket title="Debts" rows={debts} empty="No debts yet." />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
    </Card>
  );
}

function Bucket({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: PortfolioAccount[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.length === 0 ? empty : `${rows.length} account${rows.length === 1 ? "" : "s"}`}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="text-sm">
                <div className="flex items-baseline gap-3">
                  <span className="flex-1 truncate">
                    {row.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {PORTFOLIO_KIND_LABEL[row.kind]}
                    </span>
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(row.current_value, { sign: "never" })}
                  </span>
                </div>
                {row.kind === "property" && row.purchase_date ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Bought {row.purchase_date}</p>
                ) : null}
                {row.linked_property_name ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Linked to {row.linked_property_name}
                  </p>
                ) : null}
                {row.holdings.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {row.holdings.map((h) => (
                      <li key={h.id} className="flex justify-between gap-2">
                        <span>
                          {h.name} × {h.quantity}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(h.value_cad, { sign: "never" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
