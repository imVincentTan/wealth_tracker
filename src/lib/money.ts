export function parseMoney(value: string | undefined | null): number | null {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return null;

  const parenNegative = /^\(.*\)$/.test(s);
  s = s.replace(/[()\s]/g, "");
  s = s.replace(/[$€£¥]/g, "");
  s = s.replace(/,/g, "");
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const amount = parenNegative ? -Math.abs(n) : n;
  return roundMoney(amount);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, opts?: { sign?: "auto" | "never" }): string {
  const sign = opts?.sign ?? "auto";
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(abs);
  if (sign === "never") return formatted;
  if (n < 0) return `−${formatted}`;
  if (n > 0) return formatted;
  return formatted;
}

export function formatMoneySigned(n: number): string {
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Math.abs(n));
  if (n < 0) return `−${formatted}`;
  if (n > 0) return `+${formatted}`;
  return formatted;
}

export function sum(values: number[]): number {
  return roundMoney(values.reduce((acc, n) => acc + n, 0));
}
