"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddAccountDialog } from "@/components/add-account-dialog";
import { formatMoney } from "@/lib/money";
import {
  PORTFOLIO_KIND_LABEL,
  isInvestmentKind,
  isSnapshotKind,
  isSpendingKind,
} from "@/lib/portfolio";
import { useLedger } from "@/lib/store";
import type { Account, PortfolioAccount } from "@/lib/types";

type Props = {
  onImport: (account?: Account) => void;
  onSample: () => void;
};

export function AccountsView({ onImport, onSample }: Props) {
  const portfolio = useLedger((s) => s.portfolio);
  const accounts = useLedger((s) => s.accounts);
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const empty = portfolio.length === 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            Add a thing once. Bank and card statements also feed Spending.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus data-icon="inline-start" />
          Add account
        </Button>
      </section>

      {empty ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="font-medium">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Add a chequing account and upload a CSV, or try the sample household.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setAddOpen(true)}>Add account</Button>
            <Button variant="outline" onClick={onSample}>
              Try a sample household
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {portfolio.map((row) => (
            <li key={row.id}>
              <AccountCard
                row={row}
                spending={accounts.find((a) => a.id === String(row.spending_account_id)) ?? null}
                expanded={openId === row.id}
                onToggle={() => setOpenId(openId === row.id ? null : row.id)}
                onImport={onImport}
              />
            </li>
          ))}
        </ul>
      )}

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AccountCard({
  row,
  spending,
  expanded,
  onToggle,
  onImport,
}: {
  row: PortfolioAccount;
  spending: Account | null;
  expanded: boolean;
  onToggle: () => void;
  onImport: (account?: Account) => void;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-baseline gap-3 px-4 py-3 text-left"
      >
        <span className="flex-1">
          <span className="font-medium">{row.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {PORTFOLIO_KIND_LABEL[row.kind]}
          </span>
        </span>
        <span className="tabular-nums text-sm">
          {formatMoney(row.current_value, { sign: "never" })}
          {row.side === "debt" ? (
            <span className="ml-1 text-xs text-muted-foreground">owed</span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <CardContent className="border-t pt-4">
          {isSpendingKind(row.kind) ? (
            <SpendingFields row={row} spending={spending} onImport={onImport} />
          ) : null}
          {isInvestmentKind(row.kind) ? <HoldingsFields row={row} /> : null}
          {row.kind === "property" ? <PropertyFields row={row} /> : null}
          {row.kind === "mortgage" || row.kind === "loan" ? <LoanFields row={row} /> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function SpendingFields({
  row,
  spending,
  onImport,
}: {
  row: PortfolioAccount;
  spending: Account | null;
  onImport: (account?: Account) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a statement CSV. The last Balance column becomes the amount on Net worth.
        {row.balance_as_of ? ` Last snapshot ${row.balance_as_of}.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (spending) onImport(spending);
            else toast.error("This account is missing its spending ledger. Add it again.");
          }}
        >
          <Upload data-icon="inline-start" />
          Upload statement
        </Button>
      </div>
      <BalanceEditor row={row} />
    </div>
  );
}

function BalanceEditor({ row }: { row: PortfolioAccount }) {
  const updatePortfolio = useLedger((s) => s.updatePortfolio);
  const [value, setValue] = useState(row.balance != null ? String(row.balance) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === "") return;
    try {
      setSaving(true);
      await updatePortfolio(row.id, { balance: Number(value) });
      toast.success("Balance updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save balance.");
    } finally {
      setSaving(false);
    }
  }

  if (!isSnapshotKind(row.kind)) return null;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={`bal-${row.id}`}>Balance</Label>
        <Input
          id={`bal-${row.id}`}
          type="number"
          step="0.01"
          className="w-40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}

function HoldingsFields({ row }: { row: PortfolioAccount }) {
  const addHolding = useLedger((s) => s.addHolding);
  const updateHolding = useLedger((s) => s.updateHolding);
  const deleteHolding = useLedger((s) => s.deleteHolding);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  async function add() {
    if (!name.trim() || qty === "" || price === "") {
      toast.error("Symbol, quantity, and CAD price are required.");
      return;
    }
    try {
      await addHolding(row.id, {
        name: name.trim(),
        quantity: Number(qty),
        price_cad: Number(price),
      });
      setName("");
      setQty("1");
      setPrice("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add holding.");
    }
  }

  return (
    <div className="space-y-4">
      {row.holdings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No holdings yet. Cash in the account is just another line.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Symbol / name</th>
              <th className="pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Price</th>
              <th className="pb-2 font-medium">Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {row.holdings.map((h) => (
              <HoldingRow
                key={h.id}
                rowId={row.id}
                holding={h}
                onSave={updateHolding}
                onDelete={deleteHolding}
              />
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Symbol / name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" placeholder="VCN" />
        </div>
        <div className="space-y-1.5">
          <Label>Qty</Label>
          <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-24" />
        </div>
        <div className="space-y-1.5">
          <Label>Price (CAD)</Label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28" />
        </div>
        <Button size="sm" onClick={() => void add()}>
          Add holding
        </Button>
      </div>
    </div>
  );
}

function HoldingRow({
  rowId,
  holding,
  onSave,
  onDelete,
}: {
  rowId: number;
  holding: PortfolioAccount["holdings"][number];
  onSave: (
    id: number,
    holdingId: number,
    body: { name: string; quantity: number; price_cad: number }
  ) => Promise<void>;
  onDelete: (id: number, holdingId: number) => Promise<void>;
}) {
  const [name, setName] = useState(holding.name);
  const [qty, setQty] = useState(String(holding.quantity));
  const [price, setPrice] = useState(String(holding.price_cad));

  return (
    <tr className="border-t">
      <td className="py-2 pr-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="py-2 pr-2">
        <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
      </td>
      <td className="py-2 pr-2">
        <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </td>
      <td className="py-2 pr-2 tabular-nums">{formatMoney(holding.value_cad, { sign: "never" })}</td>
      <td className="py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void onSave(rowId, holding.id, {
              name: name.trim() || holding.name,
              quantity: Number(qty),
              price_cad: Number(price),
            })
          }
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void onDelete(rowId, holding.id)}>
          Remove
        </Button>
      </td>
    </tr>
  );
}

function PropertyFields({ row }: { row: PortfolioAccount }) {
  const updatePortfolio = useLedger((s) => s.updatePortfolio);
  const [date, setDate] = useState(row.purchase_date ?? "");
  const [price, setPrice] = useState(row.purchase_price != null ? String(row.purchase_price) : "");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label>Purchase date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Purchase price</Label>
        <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void updatePortfolio(row.id, {
            purchase_date: date,
            purchase_price: Number(price),
          }).then(() => toast.success("Property updated."))
        }
      >
        Save
      </Button>
    </div>
  );
}

function LoanFields({ row }: { row: PortfolioAccount }) {
  const portfolio = useLedger((s) => s.portfolio);
  const updatePortfolio = useLedger((s) => s.updatePortfolio);
  const properties = useMemo(
    () => portfolio.filter((a) => a.kind === "property"),
    [portfolio]
  );
  const [linked, setLinked] = useState(
    row.linked_property_id != null ? String(row.linked_property_id) : ""
  );

  return (
    <div className="space-y-4">
      <BalanceEditor row={row} />
      {properties.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>Linked property</Label>
            <select
              value={linked}
              onChange={(e) => setLinked(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">None</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void updatePortfolio(row.id, {
                linked_property_id: linked ? Number(linked) : null,
              }).then(() => toast.success("Link saved."))
            }
          >
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
