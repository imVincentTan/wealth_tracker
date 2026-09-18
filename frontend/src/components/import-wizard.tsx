"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type Account, type AccountType, type DetectResult, type ImportPreview, type Institution } from "@/lib/api";
import { formatCad } from "@/lib/utils";

const INSTITUTIONS: { value: Institution; label: string }[] = [
  { value: "td", label: "TD" },
  { value: "amex", label: "Amex" },
  { value: "chase", label: "Chase" },
  { value: "other", label: "Other" },
];

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "chequing", label: "Chequing" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
];

const MAPPER_FIELDS: { key: string; label: string }[] = [
  { key: "date_column", label: "Date" },
  { key: "description_column", label: "Description" },
  { key: "amount_column", label: "Amount" },
  { key: "debit_column", label: "Withdrawals / debit" },
  { key: "credit_column", label: "Deposits / credit" },
  { key: "type_column", label: "Type (optional)" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onImported: () => Promise<void> | void;
};

export default function ImportWizard({ open, onOpenChange, accounts, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountId, setAccountId] = useState<number | "">("");
  const [newName, setNewName] = useState("");
  const [institution, setInstitution] = useState<Institution>("other");
  const [accountType, setAccountType] = useState<AccountType>("chequing");
  const [mapping, setMapping] = useState<Record<string, unknown>>({});
  const [invertSign, setInvertSign] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setDetect(null);
    setPreview(null);
    setAccountId("");
    setNewName("");
    setInstitution("other");
    setAccountType("chequing");
    setMapping({});
    setInvertSign(false);
  };

  const parserConfig = useMemo(() => {
    const amountMode = mapping.debit_column && mapping.credit_column ? "debit_credit" : "signed";
    return {
      ...mapping,
      amount_mode: amountMode,
      invert_sign: invertSign,
    };
  }, [mapping, invertSign]);

  const onFile = async (next: File | null) => {
    if (!next) return;
    setBusy(true);
    try {
      const result = await api.detectCsv(next);
      setFile(next);
      setDetect(result);
      setPreview(null);
      setMapping(result.parser_config);
      setInvertSign(Boolean(result.parser_config.invert_sign));
      if (result.institution) setInstitution(result.institution);
      if (result.account_type) setAccountType(result.account_type);
      const match = accounts.find(
        (a) => a.institution === result.institution && a.account_type === result.account_type,
      );
      setAccountId(match?.id ?? "");
      setNewName(match ? "" : suggestedName(result.institution, result.account_type, result.filename));
      toast.success(`Detected ${result.confidence} confidence mapping`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const ensureAccount = async () => {
    if (accountId !== "") return Number(accountId);
    if (!newName.trim()) throw new Error("Create an account or pick an existing one.");
    const created = await api.createAccount({
      name: newName.trim(),
      institution,
      account_type: accountType,
      parser_config: parserConfig,
    });
    setAccountId(created.id);
    return created.id;
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const id = await ensureAccount();
      const result = await api.previewImport(id, file, parserConfig, true);
      setPreview(result);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.commitImport(preview.import_id);
      toast.success(`Imported ${result.committed_count} transactions`);
      reset();
      onOpenChange(false);
      await onImported();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Auto-detects Chase and generic Date/Description/Amount files. Map columns if needed, then preview
            before commit. Original CSV text is stored in Postgres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="csv">Statement file</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              className="mt-1"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {detect && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
              <p>
                <span className="font-medium">{detect.filename}</span> · {detect.confidence} confidence
              </p>
              <p className="mt-1 text-stone-600">{detect.notes}</p>
            </div>
          )}

          {detect && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Existing account</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Create new…</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.institution})
                    </option>
                  ))}
                </select>
              </div>
              {accountId === "" && (
                <>
                  <div>
                    <Label>New account name</Label>
                    <Input className="mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Institution</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value as Institution)}
                    >
                      {INSTITUTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Account type</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                    >
                      {ACCOUNT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {detect && (
            <div>
              <p className="mb-2 text-sm font-medium">Column mapper</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {MAPPER_FIELDS.map((field) => (
                  <div key={field.key}>
                    <Label>{field.label}</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
                      value={String(mapping[field.key] ?? "")}
                      onChange={(e) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {detect.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={invertSign}
                  onChange={(e) => setInvertSign(e.target.checked)}
                />
                Invert signs (use for TD/Amex cards where purchases are positive)
              </label>
            </div>
          )}

          {detect && (
            <Button onClick={runPreview} disabled={busy}>
              {busy ? "Parsing…" : "Preview import"}
            </Button>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                {preview.transactions.length} parsed rows · {preview.skipped_duplicates} already in the ledger
              </p>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.transactions.slice(0, 40).map((row, index) => (
                      <TableRow key={`${row.dedup_hash ?? row.description}-${index}`} className={row.is_duplicate ? "opacity-50" : ""}>
                        <TableCell>{row.transaction_date}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>{row.transaction_type}</TableCell>
                        <TableCell className="text-right">{formatCad(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={commit} disabled={busy}>
                Commit to Postgres
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function suggestedName(
  institution: Institution | null,
  accountType: AccountType | null,
  filename: string,
) {
  const inst = institution ? institution.toUpperCase() : "Account";
  const type = accountType ? accountType.replace("_", " ") : "";
  if (type) return `${inst} ${type}`;
  return filename.replace(/\.csv$/i, "") || "Imported account";
}
