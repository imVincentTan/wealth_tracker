"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, API_URL, type ApiImport } from "@/lib/api";
import { useLedger } from "@/lib/store";
import type { Account } from "@/lib/types";
import { ImportTracePanel } from "@/components/import-trace-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function deleteWarning(imp: ApiImport): string {
  if (imp.status === "committed") {
    const n = imp.row_count;
    return n === 1
      ? "This removes 1 transaction from the ledger and the original CSV. It cannot be undone."
      : `This removes ${n} transactions from the ledger and the original CSV. It cannot be undone.`;
  }
  return "This import was never committed. It removes the stored CSV and preview rows. It cannot be undone.";
}

export function DataFilesDialog({ open, onOpenChange, accounts }: Props) {
  const deleteImport = useLedger((s) => s.deleteImport);
  const [imports, setImports] = useState<ApiImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [pending, setPending] = useState<ApiImport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState<ApiImport | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    // Reset here (not in the effect) so the fresh fetch starts clean on reopen.
    if (!next) {
      setImports(null);
      setError(null);
      setLastTrace(undefined);
      setPending(null);
      setDeleting(false);
      setRenaming(null);
      setRenameValue("");
      setSaving(false);
    }
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .getImports()
      .then((rows) => {
        if (!cancelled) setImports(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load imports.");
      });
    api
      .getLastImportTrace()
      .then((trace) => {
        if (!cancelled) setLastTrace(trace);
      })
      .catch(() => {
        if (!cancelled) setLastTrace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteImport(pending.id);
      setImports((rows) => (rows ?? []).filter((row) => row.id !== pending.id));
      setPending(null);
      toast.success(
        result.deleted_transactions
          ? `Removed ${result.filename} (${result.deleted_transactions} transaction${
              result.deleted_transactions === 1 ? "" : "s"
            }).`
          : `Removed ${result.filename}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that import.");
    } finally {
      setDeleting(false);
    }
  }

  function startRename(imp: ApiImport) {
    setPending(null);
    setError(null);
    setRenaming(imp);
    setRenameValue(imp.filename);
  }

  async function confirmRename() {
    if (!renaming) return;
    const next = renameValue.trim();
    if (!next) {
      setError("Enter a file name.");
      return;
    }
    if (next === renaming.filename) {
      setRenaming(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.renameImport(renaming.id, next);
      setImports((rows) => (rows ?? []).map((row) => (row.id === updated.id ? updated : row)));
      setRenaming(null);
      toast.success(`Renamed to ${updated.filename}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename that file.");
    } finally {
      setSaving(false);
    }
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const busy = deleting || saving;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Data files</DialogTitle>
          <DialogDescription>
            Every import keeps its original CSV. Download it here, or find it on disk under{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">backend/data/raw/</code> — those
            files survive a database reset. Rename a file if the bank’s name is unhelpful.
            Delete a file to drop its ledger rows too, if a statement was imported twice or
            came in wrong.
          </DialogDescription>
        </DialogHeader>

        {lastTrace ? (
          <ImportTracePanel trace={lastTrace} title="Last import trace" />
        ) : lastTrace === null ? (
          <p className="text-xs text-muted-foreground">
            No import trace yet. After you import a CSV, a copy-paste debug blob shows up here.
          </p>
        ) : null}

        {renaming ? (
          <form
            className="space-y-3 rounded-xl border bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmRename();
            }}
          >
            <p className="text-sm font-medium">Rename {renaming.filename}</p>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              disabled={saving}
              aria-label="File name"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !renameValue.trim()}>
                {saving ? "Saving…" : "Save name"}
              </Button>
            </div>
          </form>
        ) : null}

        {pending ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium">Delete {pending.filename}?</p>
            <p className="text-sm text-muted-foreground">{deleteWarning(pending)}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPending(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete file"}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : imports === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading imports…</p>
        ) : imports.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No imports yet. Originals are filed here after you commit one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                  <th className="px-3 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-t">
                    <td className="max-w-48 truncate px-3 py-2 font-medium" title={imp.filename}>
                      <button
                        type="button"
                        className="max-w-full truncate text-left hover:underline"
                        onClick={() => startRename(imp)}
                        disabled={busy}
                      >
                        {imp.filename}
                      </button>
                    </td>
                    <td className="max-w-36 truncate px-3 py-2 text-muted-foreground">
                      {accountName.get(String(imp.account_id)) ?? `Account #${imp.account_id}`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDate(imp.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{imp.row_count}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {imp.raw_file ? (
                          <a
                            href={`${API_URL}/imports/${imp.id}/raw_csv`}
                            download={imp.filename}
                            title={`Download ${imp.filename}`}
                            className="inline-flex text-primary hover:underline"
                          >
                            <Download className="size-4" />
                            <span className="sr-only">Download {imp.filename}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Not committed yet">
                            —
                          </span>
                        )}
                        <button
                          type="button"
                          title={`Rename ${imp.filename}`}
                          className="inline-flex text-muted-foreground hover:text-foreground"
                          onClick={() => startRename(imp)}
                          disabled={busy}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Rename {imp.filename}</span>
                        </button>
                        <button
                          type="button"
                          title={`Delete ${imp.filename}`}
                          className="inline-flex text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setRenaming(null);
                            setPending(imp);
                          }}
                          disabled={busy}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete {imp.filename}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
