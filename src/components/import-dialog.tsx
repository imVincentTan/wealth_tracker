"use client";

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
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [fileText, setFileText] = useState("");
  const [delimiter, setDelimiter] = useState("");
  const [headerRow, setHeaderRow] = useState(1);

  function reset() {
    setPreview(null);
    setError(null);
    setFile(null);
    setName("");
    setKind("checking");
    setInvert(false);
    setMapping(null);
    setShowColumnEditor(false);
    setFileText("");
    setDelimiter("");
    setHeaderRow(1);
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
    setFileText(text);
    setDelimiter(next.delimiter);
    setHeaderRow(next.headerRow);
    setName(next.suggestedName);
    setKind(next.suggestedKind);
    setInvert(next.invertAmounts);
    setMapping(next.mapping);
  }

  function reparse(nextDelimiter: string, nextHeaderRow: number) {
    if (!file || !fileText) return;
    const next = parseCsvText(fileText, file.name, {
      delimiter: nextDelimiter,
      headerRow: nextHeaderRow,
    });
    // Refresh the suggestions only while they still reflect the previous
    // suggestion — never clobber a name/kind the user typed themselves.
    if (preview && name === preview.suggestedName) setName(next.suggestedName);
    if (preview && kind === preview.suggestedKind) setKind(next.suggestedKind);
    setPreview(next);
    setMapping(next.mapping);
    setInvert(next.invertAmounts);
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
        // Always the resolved delimiter from the preview (never "" / re-sniff),
        // so the commit-time backend parse matches what the user approved.
        delimiter: preview.delimiter,
        headerRow,
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
            CSV from a credit card or checking account. The file is stored only on this computer.
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
                TD, Chase, Amex, Capital One, Bank of America, and generic Date / Description / Amount files.
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

            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="delimiter">Separator</Label>
                <select
                  id="delimiter"
                  value={delimiter}
                  onChange={(e) => {
                    const d = e.target.value;
                    setDelimiter(d);
                    reparse(d, headerRow);
                  }}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Auto</option>
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={"\t"}>Tab</option>
                  <option value="|">Pipe</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="header-row">Header row</Label>
                <Input
                  id="header-row"
                  type="number"
                  min={0}
                  max={50}
                  value={headerRow}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(50, Number(e.target.value) || 0));
                    setHeaderRow(n);
                    reparse(delimiter, n);
                  }}
                  className="h-8 w-24"
                />
              </div>
              <p className="pb-1.5 text-xs text-muted-foreground">
                Row that holds column names (blank lines don&apos;t count). 0 = no header row.
              </p>
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

            {mapping && (preview.confidence === "low" || showColumnEditor) && (
              <ColumnRoleTable preview={preview} mapping={mapping} onChange={setMapping} />
            )}

            {preview.confidence !== "low" && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline"
                onClick={() => setShowColumnEditor((v) => !v)}
              >
                {showColumnEditor ? "Hide column mapping" : "Adjust column mapping"}
              </button>
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
          <Button
            onClick={confirmImport}
            disabled={!preview || !mapping || missingPieces(mapping).length > 0}
          >
            Import transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLUMN_ROLES: { value: keyof ColumnMapping | ""; label: string }[] = [
  { value: "", label: "Skip" },
  { value: "date", label: "Date" },
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount (signed)" },
  { value: "debit", label: "Debit / money out" },
  { value: "credit", label: "Credit / money in" },
  { value: "category", label: "Bank category" },
  { value: "type", label: "Type marker" },
];

function missingPieces(mapping: ColumnMapping): string[] {
  const missing: string[] = [];
  if (!mapping.date) missing.push("Date");
  if (!mapping.description) missing.push("Description");
  if (!mapping.amount && !mapping.debit && !mapping.credit) missing.push("Amount or Debit/Credit");
  return missing;
}

function ColumnRoleTable({
  preview,
  mapping,
  onChange,
}: {
  preview: ImportPreview;
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) {
  const roleByHeader = new Map<string, keyof ColumnMapping>();
  for (const [role, header] of Object.entries(mapping) as [keyof ColumnMapping, string | null][]) {
    if (header) roleByHeader.set(header, role);
  }

  function assign(header: string, role: keyof ColumnMapping | "") {
    const next = { ...mapping };
    for (const key of Object.keys(next) as (keyof ColumnMapping)[]) {
      if (next[key] === header) next[key] = null;
    }
    // Roles are unique: assigning one evicts whichever header held it before.
    if (role) next[role] = header;
    onChange(next);
  }

  const missing = missingPieces(mapping);
  const rows = preview.rows.slice(0, 8);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">What is each column?</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {preview.headers.map((h) => (
                <th key={h} className="px-3 py-2 align-top font-medium">
                  <div className="min-w-32 space-y-1.5">
                    <div className="max-w-40 truncate text-muted-foreground" title={h}>
                      {h}
                    </div>
                    <select
                      value={roleByHeader.get(h) ?? ""}
                      onChange={(e) => assign(h, e.target.value as keyof ColumnMapping | "")}
                      className={cn(
                        "h-8 w-full rounded-lg border bg-transparent px-2 text-xs",
                        roleByHeader.has(h)
                          ? "border-primary text-foreground"
                          : "border-input text-muted-foreground"
                      )}
                    >
                      {COLUMN_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {preview.headers.map((h) => (
                  <td
                    key={h}
                    className="max-w-40 truncate px-3 py-1.5 text-muted-foreground"
                    title={row[h]}
                  >
                    {row[h]?.trim() ? row[h] : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {preview.rows.length > 8 ? (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Showing 8 of {preview.rows.length} rows.
          </p>
        ) : null}
      </div>
      {missing.length > 0 ? (
        <p className="text-xs text-amber-700">Still needed before import: {missing.join(", ")}.</p>
      ) : null}
    </div>
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
