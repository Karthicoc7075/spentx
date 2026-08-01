"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlanPieChart } from "@/components/plan/PlanPieChart";
import { UtilizationGauge } from "@/components/plan/UtilizationGauge";
import { cn, formatCurrency } from "@/lib/utils";
import type { PlanAllocation, Transaction } from "@/types";

type PlanOverviewPanelProps = {
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  pieData: Array<{ name: string; value: number; color: string }>;
  activeCategory: string | null;
  utilization: number;
  onCategorySelect: (category: string) => void;
  transactions?: Transaction[];
  totalPlanned?: number;
  month?: string;
};

function formatVariance(planned: number, actual: number) {
  const variance = actual - planned;
  if (variance === 0) return "₹0";
  return variance > 0
    ? `-₹${variance.toLocaleString("en-IN")}`
    : `+₹${Math.abs(variance).toLocaleString("en-IN")}`;
}

export function PlanOverviewPanel({
  allocations,
  categorySpentActuals,
  pieData,
  activeCategory,
  utilization,
  onCategorySelect,
  transactions = [],
  totalPlanned = 0,
  month,
}: PlanOverviewPanelProps) {
  const rows = allocations
    .filter((allocation) => allocation.plannedAmount > 0)
    .map((allocation) => {
      const actual = categorySpentActuals[allocation.category] || 0;
      return {
        category: allocation.category,
        planned: allocation.plannedAmount,
        actual,
        color: allocation.color,
        isOver: actual > allocation.plannedAmount,
        notStarted: actual === 0,
      };
    });

  const velocityChartData = useMemo(() => {
    if (!totalPlanned || !month) return [];
    const [year, m] = month.split("-").map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === m;
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

    const dailySpendMap: Record<number, number> = {};
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const date = new Date(t.transactionDate || t.date || 0);
      if (date.getFullYear() === year && date.getMonth() + 1 === m) {
        const day = date.getDate();
        dailySpendMap[day] = (dailySpendMap[day] || 0) + (t.totalAmount || t.amount || 0);
      }
    }

    let cumActual = 0;
    const points = [];
    const dailyTargetSlope = totalPlanned / daysInMonth;

    for (let d = 1; d <= daysInMonth; d++) {
      if (d <= currentDay) {
        cumActual += dailySpendMap[d] || 0;
      }
      points.push({
        day: `Day ${d}`,
        target: Math.round(dailyTargetSlope * d),
        actual: d <= currentDay ? cumActual : undefined,
      });
    }

    return points;
  }, [totalPlanned, month, transactions]);

  return (
    <div className="sx-surface">
      <div className="space-y-6 p-6">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Planned Allocation Split
          </p>
          <PlanPieChart
            activeCategory={activeCategory}
            data={pieData}
            onCategorySelect={onCategorySelect}
          />
        </div>

        <UtilizationGauge utilization={utilization} />

        {velocityChartData.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Spend Velocity & Projection
              </p>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-primary">
                  <span className="size-2 rounded-full bg-primary" />
                  Actual
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                  Target Slope
                </span>
              </div>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Number(v) / 1000}k`} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    formatter={(val) => [formatCurrency(Number(val)), "Amount"]}
                  />
                  <Area type="monotone" dataKey="target" stroke="var(--muted-foreground)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="actual" stroke="var(--primary)" fill="url(#velocityGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Plan vs Actual
          </p>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Allocate category amounts to compare against actual spending.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-2">Category</th>
                    <th className="pb-2 pr-2 text-right">Planned</th>
                    <th className="pb-2 pr-2 text-right">Actual</th>
                    <th className="pb-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.category}>
                      <td className="py-2.5 pr-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.category}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono">
                        {formatCurrency(row.planned)}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono">
                        {formatCurrency(row.actual)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 text-right font-mono",
                          row.isOver
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {formatVariance(row.planned, row.actual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}