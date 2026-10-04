"use client";

import { useState } from "react";
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
import { useLedger } from "@/lib/store";
import type { Account } from "@/lib/types";

type Props = {
  account: Account;
  onClose: () => void;
};

export function RenameAccountDialog({ account, onClose }: Props) {
  const accounts = useLedger((s) => s.accounts);
  const renameAccount = useLedger((s) => s.renameAccount);
  const [name, setName] = useState(account.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

  function validate(value: string): string | null {
    if (!value) return "Enter a name for the account.";
    const clash = accounts.some(
      (a) => a.id !== account.id && a.name.toLowerCase() === value.toLowerCase()
    );
    if (clash) return "An account with that name already exists.";
    return null;
  }

  async function save() {
    const problem = validate(trimmed);
    if (problem) {
      setError(problem);
      return;
    }
    if (trimmed === account.name) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await renameAccount(account.id, trimmed);
      toast.success(`Renamed to ${trimmed}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename account</DialogTitle>
          <DialogDescription>
            Choose the name shown for {account.name} across Tally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="rename-account-name">Account name</Label>
          <Input
            id="rename-account-name"
            value={name}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) void save();
            }}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}