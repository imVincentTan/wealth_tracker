"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { institutionFromName } from "@/lib/api";
import { ADD_KIND_OPTIONS, PORTFOLIO_KIND_LABEL, isSpendingKind } from "@/lib/portfolio";
import { useLedger } from "@/lib/store";
import type { PortfolioKind } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddAccountDialog({ open, onOpenChange }: Props) {
  const createPortfolio = useLedger((s) => s.createPortfolio);
  const portfolio = useLedger((s) => s.portfolio);
  const [kind, setKind] = useState<PortfolioKind>("chequing");
  const [name, setName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [balance, setBalance] = useState("");
  const [linkedPropertyId, setLinkedPropertyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const properties = useMemo(
    () => portfolio.filter((a) => a.kind === "property"),
    [portfolio]
  );

  function reset() {
    setKind("chequing");
    setName("");
    setPurchaseDate("");
    setPurchasePrice("");
    setBalance("");
    setLinkedPropertyId("");
    setError(null);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    if (portfolio.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("An account with that name already exists.");
      return;
    }
    try {
      setSaving(true);
      const body: Parameters<typeof createPortfolio>[0] = { name: trimmed, kind };
      if (isSpendingKind(kind)) body.institution = institutionFromName(trimmed);
      if (kind === "property") {
        if (!purchaseDate || !purchasePrice) {
          setError("Property needs a purchase date and price.");
          setSaving(false);
          return;
        }
        body.purchase_date = purchaseDate;
        body.purchase_price = Number(purchasePrice);
      }
      if (kind === "mortgage" || kind === "loan") {
        if (balance === "") {
          setError("Enter the current balance.");
          setSaving(false);
          return;
        }
        body.balance = Number(balance);
        if (linkedPropertyId) body.linked_property_id = Number(linkedPropertyId);
      }
      await createPortfolio(body);
      toast.success(`Added ${trimmed}.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an account</DialogTitle>
          <DialogDescription>
            Type decides whether it shows on Spending, Net worth, or both.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-kind">What is it?</Label>
            <select
              id="new-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PortfolioKind)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {ADD_KIND_OPTIONS.map((opt) => (
                <option key={opt.kind} value={opt.kind}>
                  {PORTFOLIO_KIND_LABEL[opt.kind]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {ADD_KIND_OPTIONS.find((o) => o.kind === kind)?.hint}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. TD Chequing"
            />
          </div>
          {kind === "property" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="purchase-date">Purchase date</Label>
                <Input
                  id="purchase-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-price">Purchase price</Label>
                <Input
                  id="purchase-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          {kind === "mortgage" || kind === "loan" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="loan-balance">Current balance</Label>
                <Input
                  id="loan-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              {properties.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="linked-property">Linked property</Label>
                  <select
                    id="linked-property"
                    value={linkedPropertyId}
                    onChange={(e) => setLinkedPropertyId(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">None</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
