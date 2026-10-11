import type { PortfolioAccount, PortfolioKind } from "./types";

export const PORTFOLIO_KIND_LABEL: Record<PortfolioKind, string> = {
  chequing: "Chequing",
  savings: "Savings",
  credit_card: "Credit card",
  tfsa: "TFSA",
  rrsp: "RRSP",
  fhsa: "FHSA",
  non_registered: "Non-registered",
  property: "Property",
  mortgage: "Mortgage",
  loan: "Loan",
};

export const ADD_KIND_OPTIONS: { kind: PortfolioKind; hint: string }[] = [
  { kind: "chequing", hint: "Upload statements; cash on Net worth" },
  { kind: "savings", hint: "Upload statements; cash on Net worth" },
  { kind: "credit_card", hint: "Upload statements; debt on Net worth" },
  { kind: "tfsa", hint: "Holdings snapshot" },
  { kind: "rrsp", hint: "Holdings snapshot" },
  { kind: "fhsa", hint: "Holdings snapshot" },
  { kind: "non_registered", hint: "Holdings snapshot" },
  { kind: "property", hint: "Purchase date and price" },
  { kind: "mortgage", hint: "Balance; optionally link a property" },
  { kind: "loan", hint: "Car, line of credit, student loan…" },
];

export function isSpendingKind(kind: PortfolioKind): boolean {
  return kind === "chequing" || kind === "savings" || kind === "credit_card";
}

export function isInvestmentKind(kind: PortfolioKind): boolean {
  return kind === "tfsa" || kind === "rrsp" || kind === "fhsa" || kind === "non_registered";
}

export function isSnapshotKind(kind: PortfolioKind): boolean {
  return isSpendingKind(kind) || kind === "mortgage" || kind === "loan";
}

export function sumPortfolio(accounts: Pick<PortfolioAccount, "side" | "current_value">[]): {
  assets: number;
  debts: number;
  net: number;
} {
  const assets = round2(
    accounts.filter((a) => a.side === "asset").reduce((n, a) => n + a.current_value, 0)
  );
  const debts = round2(
    accounts.filter((a) => a.side === "debt").reduce((n, a) => n + a.current_value, 0)
  );
  return { assets, debts, net: round2(assets - debts) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
