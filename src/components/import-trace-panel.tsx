"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  trace: unknown;
  title?: string;
};

export function ImportTracePanel({ trace, title = "Import trace" }: Props) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const json = JSON.stringify(trace, null, 2);

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  function markCopied() {
    setCopied(true);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      markCopied();
    } catch {
      const area = document.createElement("textarea");
      area.value = json;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      markCopied();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste this into a chat to debug an import. It may include filenames, account names,
        column headers, and date/amount samples. It stays on this computer.
      </p>
      <pre className="max-h-64 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
        {json}
      </pre>
    </div>
  );
}
