"use client";

import { TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { InvestmentSummary } from "@/types";

type InvestmentSummaryCardProps = {
  summary: InvestmentSummary;
};

export function InvestmentSummaryCard({ summary }: InvestmentSummaryCardProps) {
  const positive = summary.overallReturnPercent >= 0;

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
          <TrendingUp className="size-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-foreground">Investment Summary</h3>
          <p className="text-sm text-muted-foreground">
            Total invested, current value, and return.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Invested
          </p>
          <p className="mt-1 text-lg font-bold">{formatCurrency(summary.totalInvested)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Current Value
          </p>
          <p className="mt-1 text-lg font-bold">
            {formatCurrency(summary.totalCurrentValue)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Overall Return
          </p>
          <p
            className={cn(
              "mt-1 text-lg font-bold",
              positive ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {positive ? "+" : ""}
            {summary.overallReturnPercent}%
          </p>
        </div>
      </div>
    </div>
  );
}