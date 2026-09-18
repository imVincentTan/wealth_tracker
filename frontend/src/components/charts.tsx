"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCad, formatMonth } from "@/lib/utils";
import type { Dashboard } from "@/lib/api";

const PIE_COLORS = ["#173f35", "#c2410c", "#0f766e", "#1d4ed8", "#a16207", "#7c3aed", "#be123c", "#334155"];

export function CategoryPie({ data }: { data: Dashboard["by_category"] }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-stone-500">No spend to chart yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="category" innerRadius={58} outerRadius={92} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCad(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBars({ data }: { data: Dashboard["monthly"] }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-stone-500">No months to chart yet.</p>;
  }
  const chartData = data.map((row) => ({
    ...row,
    label: formatMonth(row.month),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={(value: number) => formatCad(value)} />
        <Bar dataKey="expenses" name="Spent" fill="#c2410c" radius={[4, 4, 0, 0]} />
        <Bar dataKey="income" name="Income" fill="#0f766e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
