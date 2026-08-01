"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyTimelineItem } from "@/lib/analytics";
import { formatCurrency } from "@/lib/utils";

type MonthlyComparisonTimelineProps = {
  data: MonthlyTimelineItem[];
};

const tickStyle = { fill: "var(--muted-foreground)", fontSize: 10 };

export function MonthlyComparisonTimeline({ data }: MonthlyComparisonTimelineProps) {
  const chartData = data;
  const hasActivity = chartData.some((item) => item.income > 0 || item.expense > 0);

  return (
    <div className="sx-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Monthly Comparison</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Income and expense trend over the last 6 months.
        </p>
      </div>

      {!hasActivity ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No monthly history yet. Add transactions across months to see comparisons.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="incomeBarGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="expenseBarGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tickStyle} tickLine={false} axisLine={false} />
              <YAxis
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(val) => formatCurrency(Number(val))}
              />
              <Legend />
              <Bar
                dataKey="income"
                fill="url(#incomeBarGrad)"
                name="Income"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expense"
                fill="url(#expenseBarGrad)"
                name="Expense"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
