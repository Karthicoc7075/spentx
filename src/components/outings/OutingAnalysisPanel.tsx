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
import { getMemberPaidAndShare } from "@/lib/outings";
import { formatCurrency } from "@/lib/utils";
import type { Outing, OutingExpense } from "@/types";

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
  totalSpent: number;
};

export function OutingAnalysisPanel({
  outing,
  expenses,
  totalSpent,
}: OutingAnalysisPanelProps) {
  const categoryData = [...new Set(expenses.map((item) => item.category))]
    .map((name) => ({
      name,
      value: expenses
        .filter((item) => item.category === name)
        .reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => b.value - a.value);

  const memberData = outing.members.map((member) => {
    const { paid, share } = getMemberPaidAndShare(member.id, expenses);
    return { name: member.name, paid, share };
  });

  const currentMember =
    outing.members.find((member) => member.isCurrentUser) ?? outing.members[0];
  const personal = currentMember
    ? getMemberPaidAndShare(currentMember.id, expenses)
    : { paid: 0, share: 0 };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="mb-1 font-semibold text-foreground">Your spending analysis</h3>
        <p className="mb-5 text-sm text-muted-foreground">
          How your payments compare to your fair share
        </p>
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              You paid
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(personal.paid)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Your share
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(personal.share)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Total spent
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(totalSpent)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="mb-4 font-semibold text-foreground">By category</h3>
          {categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses yet.</p>
          ) : (
            <div className="h-64">
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
          )}
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <h3 className="mb-4 font-semibold text-foreground">By member</h3>
          {memberData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={memberData}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="paid" fill="var(--chart-1)" name="Paid" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="share" fill="var(--chart-3)" name="Share" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}