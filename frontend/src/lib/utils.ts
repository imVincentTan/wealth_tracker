import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCad(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

export function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
  });
}
