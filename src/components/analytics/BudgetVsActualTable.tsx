"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

type BudgetVsActualRow = {
  category: string;
  planned: number;
  actual: number;
  color: string;
  status: "under" | "over";
};

type BudgetVsActualTableProps = {
  rows: BudgetVsActualRow[];
  planMonth?: string;
};

function formatVariance(planned: number, actual: number) {
  const variance = actual - planned;
  if (variance === 0) return "₹0";
  return variance > 0 ? `-₹${variance.toLocaleString("en-IN")}` : `+₹${Math.abs(variance).toLocaleString("en-IN")}`;
}

export function BudgetVsActualTable({ rows, planMonth }: BudgetVsActualTableProps) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Budget vs Actual</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          How planned spending compares to reality.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">No budget set for this month.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a monthly plan to compare against actual spending.
          </p>
          <Link
            className="mt-4 inline-flex h-8 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
            href={planMonth ? `/plan?month=${planMonth}` : "/plan"}
          >
            Set plan →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2 text-right">Planned</th>
                <th className="px-2 py-2 text-right">Actual</th>
                <th className="px-2 py-2 text-right">Variance</th>
                <th className="px-2 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const isOver = row.status === "over";
                const notStarted = row.actual === 0;

                return (
                  <tr key={row.category}>
                    <td className="px-2 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.category}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right font-mono">
                      {formatCurrency(row.planned)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono">
                      {formatCurrency(row.actual)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-3 text-right font-mono",
                        isOver
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {formatVariance(row.planned, row.actual)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {notStarted ? (
                        <Badge variant="secondary">Not started</Badge>
                      ) : isOver ? (
                        <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                          Over budget
                        </Badge>
                      ) : (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          On track
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}