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
  const rows = useMemo(() => {
    const rowMap = new Map<string, any>();
    const normCategory = (name: string) => {
      const trimmed = (name || "").trim().toLowerCase();
      if (trimmed === "cat-exp-outings" || trimmed === "outings" || trimmed === "outing" || trimmed.includes("outing")) {
        return "outings";
      }
      return trimmed;
    };

    for (const allocation of allocations) {
      const norm = normCategory(allocation.category);
      const cleanCategory = norm === "outings" ? "Outings" : allocation.category;
      const actual =
        norm === "outings"
          ? categorySpentActuals["Outings"] || categorySpentActuals["Outing"] || 0
          : categorySpentActuals[cleanCategory] || 0;

      const existing = rowMap.get(norm);
      if (!existing) {
        if (allocation.plannedAmount > 0 || actual > 0) {
          rowMap.set(norm, {
            category: cleanCategory,
            planned: allocation.plannedAmount,
            actual,
            color: norm === "outings" ? "#0ea5e9" : allocation.color,
            isOver: allocation.plannedAmount > 0 ? actual > allocation.plannedAmount : actual > 0,
            notStarted: actual === 0,
            isUnbudgeted: allocation.plannedAmount === 0 && actual > 0,
          });
        }
      } else {
        const planned = Math.max(existing.planned, allocation.plannedAmount);
        rowMap.set(norm, {
          ...existing,
          planned,
          isOver: planned > 0 ? actual > planned : actual > 0,
          isUnbudgeted: planned === 0 && actual > 0,
        });
      }
    }

    for (const [cat, actual] of Object.entries(categorySpentActuals)) {
      if (actual <= 0) continue;
      const norm = normCategory(cat);
      if (!rowMap.has(norm)) {
        const cleanCategory = norm === "outings" ? "Outings" : cat;
        rowMap.set(norm, {
          category: cleanCategory,
          planned: 0,
          actual,
          color: norm === "outings" ? "#0ea5e9" : "#94a3b8",
          isOver: true,
          notStarted: false,
          isUnbudgeted: true,
        });
      }
    }

    return Array.from(rowMap.values());
  }, [allocations, categorySpentActuals]);

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
                      <td className="py-2.5 pr-2 text-right font-sans tabular-nums font-medium">
                        {row.isUnbudgeted ? (
                          <span className="text-[11px] font-sans font-medium text-amber-600 dark:text-amber-400">
                            No limit
                          </span>
                        ) : (
                          formatCurrency(row.planned)
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-sans tabular-nums font-semibold">
                        {formatCurrency(row.actual)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 text-right font-sans tabular-nums font-semibold",
                          row.isUnbudgeted
                            ? "text-amber-600 dark:text-amber-400"
                            : row.isOver
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {row.isUnbudgeted
                          ? `-₹${row.actual.toLocaleString("en-IN")}`
                          : formatVariance(row.planned, row.actual)}
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