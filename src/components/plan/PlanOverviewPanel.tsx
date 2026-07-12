"use client";

import { PlanPieChart } from "@/components/plan/PlanPieChart";
import { UtilizationGauge } from "@/components/plan/UtilizationGauge";
import { cn, formatCurrency } from "@/lib/utils";
import type { PlanAllocation } from "@/types";

type PlanOverviewPanelProps = {
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  pieData: Array<{ name: string; value: number; color: string }>;
  activeCategory: string | null;
  utilization: number;
  onCategorySelect: (category: string) => void;
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

  return (
    <div className="rounded-2xl border bg-card">
      <div className="space-y-6 p-6">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Planned Split
          </p>
          <PlanPieChart
            activeCategory={activeCategory}
            data={pieData}
            onCategorySelect={onCategorySelect}
          />
        </div>

        <UtilizationGauge utilization={utilization} />

        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Budget vs Actual
          </p>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Allocate category budgets to compare against actual spending.
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