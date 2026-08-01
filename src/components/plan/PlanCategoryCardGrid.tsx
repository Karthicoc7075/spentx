"use client";

import { ChevronDown, ChevronUp, Minus, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import type { PlanAllocation, Transaction } from "@/types";

type PlanCategoryCardGridProps = {
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  transactions: Transaction[];
  onQuickAdjust?: (id: string, delta: number) => void;
  onEditClick: () => void;
};

export function PlanCategoryCardGrid({
  allocations,
  categorySpentActuals,
  transactions,
  onQuickAdjust,
  onEditClick,
}: PlanCategoryCardGridProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const activeAllocations = allocations.filter((a) => a.plannedAmount > 0);

  function getTopSpenders(categoryName: string) {
    return transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          (t.category ?? "").trim().toLowerCase() === categoryName.trim().toLowerCase(),
      )
      .sort((a, b) => (b.totalAmount ?? b.amount ?? 0) - (a.totalAmount ?? a.amount ?? 0))
      .slice(0, 3);
  }

  if (activeAllocations.length === 0) {
    return (
      <div className="sx-surface flex flex-col items-center justify-center p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">No Budget Allocations Set</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Set spending targets for your expense categories to track budgets and prevent overspending.
        </p>
        <Button className="mt-4" size="sm" onClick={onEditClick}>
          Setup Allocations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Category Targets & Progress</h3>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={onEditClick}>
          Edit Limits
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {activeAllocations.map((item) => {
          const actual = categorySpentActuals[item.category] || 0;
          const planned = item.plannedAmount;
          const remaining = planned - actual;
          const percent = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
          const isOver = actual > planned;
          const isWarning = !isOver && percent >= 80;
          const isExpanded = expandedCategory === item.category;
          const topSpenders = isExpanded ? getTopSpenders(item.category) : [];

          return (
            <div
              key={item.id}
              className={cn(
                "sx-surface-interactive relative flex flex-col justify-between p-4 transition-all",
                isOver && "border-rose-500/40 bg-rose-500/5 dark:border-rose-500/30",
                isWarning && "border-amber-500/40 bg-amber-500/5 dark:border-amber-500/30",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color || "#38bdf8" }}
                    />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {item.category}
                    </span>
                  </div>

                  <Badge
                    variant={isOver ? "destructive" : isWarning ? "outline" : "secondary"}
                    className={cn(
                      "text-[10px] font-semibold tabular-nums shrink-0",
                      isWarning && "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10",
                    )}
                  >
                    {isOver ? "Over Budget" : `${percent}%`}
                  </Badge>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Spent: <strong className="font-mono text-foreground">{formatCurrency(actual)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Limit: <strong className="font-mono text-foreground">{formatCurrency(planned)}</strong>
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isOver
                        ? "bg-rose-500"
                        : isWarning
                        ? "bg-amber-500"
                        : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span
                    className={cn(
                      "font-mono font-medium",
                      remaining < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {remaining < 0
                      ? `${formatCurrency(Math.abs(remaining))} over`
                      : `${formatCurrency(remaining)} left`}
                  </span>

                  <button
                    type="button"
                    onClick={() => setExpandedCategory(isExpanded ? null : item.category)}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <span>Details</span>
                    {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>
                </div>
              </div>

              {/* Quick Adjust Buttons */}
              {onQuickAdjust ? (
                <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Quick limit adjust</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-6 rounded-md hover:bg-destructive/10 hover:text-destructive"
                      title="Decrease limit by ₹500"
                      onClick={() => onQuickAdjust(item.id, -500)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-6 rounded-md hover:bg-emerald-500/10 hover:text-emerald-500"
                      title="Increase limit by ₹500"
                      onClick={() => onQuickAdjust(item.id, 500)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Expandable Top Spenders Drawer */}
              {isExpanded ? (
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs space-y-1.5 animate-in fade-in-50 duration-150">
                  <span className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
                    Top Expenses in {item.category}
                  </span>
                  {topSpenders.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-1">No expenses recorded yet.</p>
                  ) : (
                    topSpenders.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between text-[11px]">
                        <span className="truncate text-foreground font-medium">{tx.merchant || "Expense"}</span>
                        <span className="font-mono text-muted-foreground tabular-nums">
                          {formatCurrency(tx.totalAmount ?? tx.amount ?? 0)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
