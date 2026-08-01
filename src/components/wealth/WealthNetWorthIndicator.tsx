"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { PurposeNetWorth } from "@/lib/wealth";
import type { NetWorthBreakdown } from "@/types";

type WealthNetWorthIndicatorProps = {
  breakdown: NetWorthBreakdown;
  purposeBreakdown: PurposeNetWorth[];
  view: "combined" | "by-purpose";
  onViewChange: (view: "combined" | "by-purpose") => void;
  isLoading?: boolean;
};

export function WealthNetWorthIndicator({
  breakdown,
  purposeBreakdown,
  view,
  onViewChange,
  isLoading,
}: WealthNetWorthIndicatorProps) {
  const trendPositive = breakdown.monthlyChange >= 0;

  return (
    <div className="sx-surface p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Net Worth</p>
          <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {isLoading ? "—" : formatCurrency(breakdown.total)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                trendPositive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
              )}
            >
              {trendPositive ? "+" : ""}
              {formatCurrency(breakdown.monthlyChange)}
            </span>
            <span className="text-xs text-muted-foreground">this month</span>
          </div>
        </div>

        <div className="inline-flex shrink-0 items-center rounded-full bg-muted p-1">
          <button
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              view === "combined"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            type="button"
            onClick={() => onViewChange("combined")}
          >
            Combined
          </button>
          <button
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              view === "by-purpose"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            type="button"
            onClick={() => onViewChange("by-purpose")}
          >
            By purpose
          </button>
        </div>
      </div>

      {view === "by-purpose" && purposeBreakdown.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {purposeBreakdown.map((item) => {
            const positive = item.monthlyChange >= 0;
            return (
              <div
                key={item.purposeId}
                className="rounded-xl bg-muted/50 px-4 py-3.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-[4px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <p className="text-sm font-medium text-muted-foreground">
                    {item.purposeName}
                  </p>
                </div>
                <p className="mt-2 text-xl font-bold tracking-tight tabular-nums">
                  {formatCurrency(item.total)}
                </p>
                {/* Bank + Cash per purpose — same maths as Combined. */}
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">
                    Bank{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(item.bankAccounts)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Cash{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(item.cash)}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      positive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatCurrency(item.monthlyChange)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    this month
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
