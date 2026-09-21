"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryTotal } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { ClientOnly } from "@/components/client-only";

export function CategoryChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No spending in this range. Income and transfers are listed separately.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-center">
      <div className="mx-auto h-52 w-full max-w-[220px]">
        <ClientOnly
          fallback={<div className="h-full w-full rounded-full bg-muted/60" />}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <PieChart>
              <Pie
                data={data}
                dataKey="spent"
                nameKey="label"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={1.5}
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatMoney(Number(value), { sign: "never" })}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
      <ul className="space-y-2">
        {data.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="flex-1 truncate">{entry.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(entry.share * 100)}%
            </span>
            <span className="w-20 text-right tabular-nums font-medium">
              {formatMoney(entry.spent, { sign: "never" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
