"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, API_URL, type ApiImport } from "@/lib/api";
import type { Account } from "@/lib/types";

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

export function DataFilesDialog({ open, onOpenChange, accounts }: Props) {
  const [imports, setImports] = useState<ApiImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    // Reset here (not in the effect) so the fresh fetch starts clean on reopen.
    if (!next) {
      setImports(null);
      setError(null);
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
    return () => {
      cancelled = true;
    };
  }, [open]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Data files</DialogTitle>
          <DialogDescription>
            Every import keeps its original CSV. Download it here, or find it on disk under{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">backend/data/raw/</code> — those
            files survive a database reset.
          </DialogDescription>
        </DialogHeader>

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
                  <th className="px-3 py-2" aria-label="Download" />
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-t">
                    <td className="max-w-48 truncate px-3 py-2 font-medium" title={imp.filename}>
                      {imp.filename}
                    </td>
                    <td className="max-w-36 truncate px-3 py-2 text-muted-foreground">
                      {accountName.get(String(imp.account_id)) ?? `Account #${imp.account_id}`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDate(imp.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{imp.row_count}</td>
                    <td className="px-3 py-2 text-right">
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
