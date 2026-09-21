"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthTotal } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { ClientOnly } from "@/components/client-only";

export function TrendChart({ data }: { data: MonthTotal[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Import more than a few days of activity to see a monthly trend.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ClientOnly fallback={<div className="h-full w-full rounded-lg bg-muted/40" />}>
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(v) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={42}
            />
            <Tooltip
              formatter={(value, name) => [
                formatMoney(Number(value), { sign: "never" }),
                name === "spent" ? "Spent" : "Income",
              ]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="spent" fill="#3F6F52" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar dataKey="income" fill="#C4B59A" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  );
}
