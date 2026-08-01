"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { Outing, OutingExpense, OutingSettlement, TripMember } from "@/types";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type OutingAnalysisPanelProps = {
  outing: Outing;
  expenses: OutingExpense[];
  settlements: OutingSettlement[];
  balances: Array<{ member: TripMember; balance: number }>;
};

export function OutingAnalysisPanel({ expenses }: OutingAnalysisPanelProps) {
  const categoryData = [...new Set(expenses.map((item) => item.category))]
    .map((name) => ({
      name,
      value: expenses
        .filter((item) => item.category === name)
        .reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="sx-surface p-6">
      <h3 className="mb-1 font-semibold text-foreground">Category breakdown</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Where the group spent money
      </p>
      {categoryData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses yet.</p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={categoryData}
                  dataKey="value"
                  innerRadius={50}
                  nameKey="name"
                  outerRadius={90}
                >
                  {categoryData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {categoryData.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                  <span className="truncate text-foreground">{item.name}</span>
                </span>
                <span className="shrink-0 font-medium text-muted-foreground">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
