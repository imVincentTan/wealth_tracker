"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { parseCsvText, amountFromRow, parseDate } from "@/lib/parse-csv";
import { useLedger } from "@/lib/store";
import type { AccountKind, ColumnMapping, ImportPreview } from "@/lib/types";
import { ACCOUNT_KINDS } from "@/lib/types";
import { FileSpreadsheet, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<AccountKind, string> = {
  checking: "Checking",
  credit: "Credit card",
  savings: "Savings",
  other: "Other",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportDialog({ open, onOpenChange }: Props) {
  const importFile = useLedger((s) => s.importFile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [invert, setInvert] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  function reset() {
    setPreview(null);
    setError(null);
    setFile(null);
    setName("");
    setKind("checking");
    setInvert(false);
    setMapping(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function loadFile(file: File) {
    setError(null);
    const text = await file.text();
    const next = parseCsvText(text, file.name);
    if (next.headers.length === 0 || next.rows.length === 0) {
      setError("That file does not look like a CSV of transactions. Export CSV from your bank and try again.");
      setPreview(null);
      return;
    }
    setPreview(next);
    setFile(file);
    setName(next.suggestedName);
    setKind(next.suggestedKind);
    setInvert(next.invertAmounts);
    setMapping(next.mapping);
  }

  async function confirmImport() {
    if (!preview || !mapping || !file) return;
    if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) {
      setError("Map at least Date, Description, and Amount (or Debit/Credit) before importing.");
      return;
    }
    try {
      const result = await importFile({
        file,
        name: name.trim() || preview.suggestedName,
        kind,
        mapping,
        invertAmounts: invert,
      });
      toast.success(
        result.skipped
          ? `Imported ${result.added} transactions (${result.skipped} already in the ledger).`
          : `Imported ${result.added} transactions.`
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import a statement</DialogTitle>
          <DialogDescription>
            CSV from a credit card or checking account. The file is stored in your local Postgres, not on a public server.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />

        {!preview ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragOver ? "border-primary bg-accent" : "border-border bg-muted/40 hover:bg-muted/70"
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
              <Upload className="size-5" />
            </span>
            <div>
              <p className="font-medium">Drop a CSV here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Chase, Amex, Capital One, Bank of America, and generic Date / Description / Amount files.
              </p>
            </div>
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none")}>
              <FileSpreadsheet data-icon="inline-start" />
              Choose file
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                {preview.formatName}
              </span>
              <span className="text-muted-foreground">
                {preview.rows.length} rows · {preview.confidence} confidence
              </span>
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline"
                onClick={reset}
              >
                Choose a different file
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="account-name">Account name</Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-kind">Account type</Label>
                <select
                  id="account-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AccountKind)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {ACCOUNT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {preview.confidence === "low" && mapping && (
              <ColumnMapper
                headers={preview.headers}
                mapping={mapping}
                onChange={setMapping}
              />
            )}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
              />
              <span>
                Charges are listed as positive numbers
                <span className="block text-muted-foreground">
                  Turn this on if grocery runs show up as income in the preview.
                </span>
              </span>
            </label>

            <PreviewTable preview={preview} mapping={mapping} invert={invert} />
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirmImport} disabled={!preview}>
            Import transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnMapper({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) {
  function bind(key: keyof ColumnMapping) {
    return (
      <select
        value={mapping[key] ?? ""}
        onChange={(e) => onChange({ ...mapping, [key]: e.target.value || null })}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
      >
        <option value="">Not in this file</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium">Match your columns</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">{bind("date")}</Field>
        <Field label="Description">{bind("description")}</Field>
        <Field label="Amount">{bind("amount")}</Field>
        <Field label="Debit (optional)">{bind("debit")}</Field>
        <Field label="Credit (optional)">{bind("credit")}</Field>
        <Field label="Bank category (optional)">{bind("category")}</Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PreviewTable({
  preview,
  mapping,
  invert,
}: {
  preview: ImportPreview;
  mapping: ColumnMapping | null;
  invert: boolean;
}) {
  if (!mapping) return null;
  const rows = preview.rows.slice(0, 6).map((row) => ({
    date: parseDate(mapping.date ? row[mapping.date] : undefined) ?? "—",
    description: mapping.description ? row[mapping.description] : "—",
    amount: amountFromRow(row, mapping, invert),
  }));

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
              <td className="px-3 py-2 max-w-64 truncate">{row.description}</td>
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  (row.amount ?? 0) < 0 ? "text-foreground" : "text-emerald-800"
                )}
              >
                {row.amount == null
                  ? "—"
                  : row.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.rows.length > 6 ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing 6 of {preview.rows.length} rows. Negative amounts are money out.
        </p>
      ) : null}
    </div>
  );
}
