"use client";

import { useEffect } from "react";
import { useLedger } from "./store";

export function useHasHydrated(): boolean {
  const ready = useLedger((s) => s.ready);
  const refresh = useLedger((s) => s.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return ready;
}
