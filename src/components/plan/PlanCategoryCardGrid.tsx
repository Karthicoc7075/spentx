"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Minus,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/transaction-ui";
import type { Outing, PlanAllocation, Transaction } from "@/types";

type PlanCategoryCardGridProps = {
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  transactions: Transaction[];
  outings?: Outing[];
  onQuickAdjust?: (id: string, delta: number) => void;
  onEditClick?: () => void;
};

export function PlanCategoryCardGrid({
  allocations,
  categorySpentActuals,
  transactions,
  outings = [],
  onQuickAdjust,
  onEditClick,
}: PlanCategoryCardGridProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "over" | "unbudgeted" | "warning" | "on-track"
  >("all");

function normalizeCategoryKey(name: string): string {
  const trimmed = (name || "").trim().toLowerCase();
  if (
    trimmed === "cat-exp-outings" ||
    trimmed === "outings" ||
    trimmed === "outing" ||
    trimmed.includes("outing")
  ) {
    return "outings";
  }
  return trimmed;
}

function getActualForCategory(categoryName: string, actuals: Record<string, number>): number {
  if (normalizeCategoryKey(categoryName) === "outings") {
    return actuals["Outings"] || actuals["Outing"] || actuals["cat-exp-outings"] || 0;
  }
  return actuals[categoryName] || 0;
}

// Inside component:
  // Include categories that have an explicit planned budget OR have money spent this month
  const activeAllocations = useMemo(() => {
    const allocationByNorm = new Map<string, PlanAllocation & { isUnbudgeted?: boolean }>();

    for (const alloc of allocations) {
      const norm = normalizeCategoryKey(alloc.category);
      const cleanCategory = norm === "outings" ? "Outings" : alloc.category;
      const actual = getActualForCategory(cleanCategory, categorySpentActuals);

      const existing = allocationByNorm.get(norm);
      if (!existing) {
        if (alloc.plannedAmount > 0 || actual > 0) {
          allocationByNorm.set(norm, {
            ...alloc,
            category: cleanCategory,
            isUnbudgeted: alloc.plannedAmount === 0 && actual > 0,
          });
        }
      } else {
        // Merge duplicates: if either has plannedAmount > 0, prefer the budgeted one!
        const maxPlanned = Math.max(existing.plannedAmount, alloc.plannedAmount);
        allocationByNorm.set(norm, {
          ...existing,
          plannedAmount: maxPlanned,
          isUnbudgeted: maxPlanned === 0 && actual > 0,
        });
      }
    }

    for (const [categoryName, actualAmount] of Object.entries(categorySpentActuals)) {
      if (actualAmount <= 0) continue;
      const norm = normalizeCategoryKey(categoryName);
      if (!allocationByNorm.has(norm)) {
        const cleanCategory = norm === "outings" ? "Outings" : categoryName;
        allocationByNorm.set(norm, {
          id: `unbudgeted-${cleanCategory}`,
          category: cleanCategory,
          plannedAmount: 0,
          color: norm === "outings" ? "#0ea5e9" : "#64748b",
          isUnbudgeted: true,
        });
      }
    }

    return Array.from(allocationByNorm.values());
  }, [allocations, categorySpentActuals]);

  const counts = useMemo(() => {
    let over = 0;
    let unbudgeted = 0;
    let warning = 0;
    let onTrack = 0;
    for (const item of activeAllocations) {
      const actual = getActualForCategory(item.category, categorySpentActuals);
      const planned = item.plannedAmount;
      if (item.isUnbudgeted || (planned === 0 && actual > 0)) {
        unbudgeted++;
      } else if (actual > planned) {
        over++;
      } else if (planned > 0 && actual / planned >= 0.8) {
        warning++;
      } else {
        onTrack++;
      }
    }
    return { all: activeAllocations.length, over, unbudgeted, warning, onTrack };
  }, [activeAllocations, categorySpentActuals]);

  const displayedAllocations = useMemo(() => {
    return activeAllocations.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.category.toLowerCase().includes(searchQuery.trim().toLowerCase());
      if (!matchesSearch) return false;

      const actual = getActualForCategory(item.category, categorySpentActuals);
      const planned = item.plannedAmount;
      const isUnbudgeted = item.isUnbudgeted || (planned === 0 && actual > 0);
      const isOver = !isUnbudgeted && actual > planned;
      const isWarning = !isUnbudgeted && !isOver && planned > 0 && actual / planned >= 0.8;

      if (statusFilter === "unbudgeted") return isUnbudgeted;
      if (statusFilter === "over") return isOver;
      if (statusFilter === "warning") return isWarning;
      if (statusFilter === "on-track") return !isUnbudgeted && !isOver && !isWarning;
      return true;
    });
  }, [activeAllocations, categorySpentActuals, searchQuery, statusFilter]);

  // Outing breakdown (Trips, Temple, Dinner, etc.)
  const outingBreakdown = useMemo(() => {
    const tripMap = new Map<string, { name: string; category?: string; total: number; count: number }>();
    let standalone = 0;

    for (const tx of transactions) {
      if (tx.type !== "expense") continue;
      const isOuting =
        tx.category === "Outings" ||
        tx.category === "Outing" ||
        Boolean(tx.outingId) ||
        (Array.isArray(tx.tags) && tx.tags.includes("outing"));

      if (!isOuting) continue;

      if (tx.outingId) {
        const foundOuting = outings.find((o) => o.id === tx.outingId);
        const name = foundOuting?.name || tx.merchant || "Outing";
        const cat = foundOuting?.category || "Trip";
        const existing = tripMap.get(tx.outingId) || { name, category: cat, total: 0, count: 0 };
        existing.total += tx.totalAmount ?? tx.amount ?? 0;
        existing.count += 1;
        tripMap.set(tx.outingId, existing);
      } else {
        standalone += tx.totalAmount ?? tx.amount ?? 0;
      }
    }

    return {
      trips: Array.from(tripMap.values()).sort((a, b) => b.total - a.total),
      standalone,
    };
  }, [transactions, outings]);

  function getTopSpenders(categoryName: string) {
    const isOutings =
      categoryName.trim().toLowerCase() === "outings" ||
      categoryName.trim().toLowerCase() === "outing";

    return transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        if (isOutings) {
          return (
            (t.category ?? "").trim().toLowerCase() === "outings" ||
            (t.category ?? "").trim().toLowerCase() === "outing" ||
            Boolean(t.outingId)
          );
        }
        return (
          (t.category ?? "").trim().toLowerCase() ===
          categoryName.trim().toLowerCase()
        );
      })
      .sort(
        (a, b) =>
          (b.totalAmount ?? b.amount ?? 0) - (a.totalAmount ?? a.amount ?? 0),
      )
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
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Category Targets &amp; Progress
        </h3>
        <p className="text-xs text-muted-foreground">
          {activeAllocations.length} categories with budget or spending this month
        </p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === "all"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            All
            <span className="opacity-70">({counts.all})</span>
          </button>

          {counts.over > 0 ? (
            <button
              type="button"
              onClick={() => setStatusFilter("over")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === "over"
                  ? "bg-rose-600 text-white font-semibold shadow-xs"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20",
              )}
            >
              <XCircle className="size-3" />
              Over Budget
              <span>({counts.over})</span>
            </button>
          ) : null}

          {counts.unbudgeted > 0 ? (
            <button
              type="button"
              onClick={() => setStatusFilter("unbudgeted")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === "unbudgeted"
                  ? "bg-amber-600 text-white font-semibold shadow-xs"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
              )}
            >
              <AlertCircle className="size-3" />
              No Limit Set
              <span>({counts.unbudgeted})</span>
            </button>
          ) : null}

          {counts.warning > 0 ? (
            <button
              type="button"
              onClick={() => setStatusFilter("warning")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                statusFilter === "warning"
                  ? "bg-amber-500 text-white font-semibold shadow-xs"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
              )}
            >
              <AlertTriangle className="size-3" />
              Near Limit
              <span>({counts.warning})</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setStatusFilter("on-track")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === "on-track"
                ? "bg-emerald-600 text-white font-semibold shadow-xs"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
            )}
          >
            <CheckCircle2 className="size-3" />
            On Track
            <span className="opacity-70">({counts.onTrack})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="h-8 pl-8 text-xs rounded-lg"
          />
        </div>
      </div>

      {displayedAllocations.length === 0 ? (
        <div className="sx-surface rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No categories match your search or filter.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 text-xs"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Clear filter
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayedAllocations.map((item) => {
            const actual = getActualForCategory(item.category, categorySpentActuals);
            const planned = item.plannedAmount;
            const remaining = planned - actual;
            const percent = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
            const isUnbudgeted = item.isUnbudgeted || (planned === 0 && actual > 0);
            const isOver = !isUnbudgeted && actual > planned;
            const isWarning = !isUnbudgeted && !isOver && percent >= 80;
            const isExpanded = expandedCategory === item.category;
            const isOutingCategory =
              item.category.toLowerCase() === "outings" ||
              item.category.toLowerCase() === "outing";
            const topSpenders = isExpanded ? getTopSpenders(item.category) : [];
            const CategoryIcon = getCategoryIcon(item.icon || item.category);

            return (
              <div
                key={item.id}
                className={cn(
                  "sx-surface-interactive relative flex flex-col justify-between p-4 transition-all",
                  isOver && "border-rose-500/40 bg-rose-500/5 dark:border-rose-500/30",
                  isUnbudgeted && "border-amber-500/40 bg-amber-500/5 dark:border-amber-500/30",
                  isWarning && "border-amber-500/40 bg-amber-500/5 dark:border-amber-500/30",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="flex size-7 items-center justify-center rounded-lg shrink-0 shadow-2xs font-bold"
                        style={{
                          backgroundColor: `${item.color || "#0ea5e9"}25`,
                          color: item.color || "#0ea5e9",
                        }}
                      >
                        <CategoryIcon className="size-3.5" />
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {item.category}
                      </span>
                    </div>

                    {isUnbudgeted ? (
                      <Badge
                        variant="warning"
                        className="text-[10px] font-semibold shrink-0 gap-1"
                      >
                        <AlertCircle className="size-3" />
                        No Limit Set
                      </Badge>
                    ) : (
                      <Badge
                        variant={isOver ? "destructive" : isWarning ? "warning" : "secondary"}
                        className="text-[10px] font-semibold tabular-nums shrink-0"
                      >
                        {isOver ? "Over Budget" : `${percent}%`}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Spent: <strong className="font-mono text-foreground">{formatCurrency(actual)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Limit:{" "}
                      <strong
                        className={cn(
                          "font-mono",
                          isUnbudgeted
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground",
                        )}
                      >
                        {planned > 0 ? formatCurrency(planned) : "Not set"}
                      </strong>
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isUnbudgeted
                          ? "bg-amber-500/70"
                          : isOver
                          ? "bg-rose-500"
                          : isWarning
                          ? "bg-amber-500"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${isUnbudgeted ? 100 : Math.min(100, Math.max(0, percent))}%`,
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span
                      className={cn(
                        "font-mono font-medium",
                        isUnbudgeted
                          ? "text-amber-600 dark:text-amber-400 font-sans"
                          : remaining < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {isUnbudgeted
                        ? "Spent without set limit"
                        : remaining < 0
                        ? `${formatCurrency(Math.abs(remaining))} over`
                        : `${formatCurrency(remaining)} left`}
                    </span>

                    <button
                      type="button"
                      onClick={() => setExpandedCategory(isExpanded ? null : item.category)}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <span>{isOutingCategory ? "Outing" : "Details"}</span>
                      {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                  </div>
                </div>

                {/* Quick Adjust or Set Limit Buttons */}
                {onQuickAdjust ? (
                  <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isUnbudgeted ? "Set target limit" : "Quick limit adjust"}
                    </span>
                    <div className="flex items-center gap-1">
                      {isUnbudgeted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] gap-1 px-2.5 font-medium border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                          onClick={() =>
                            onQuickAdjust(
                              item.id,
                              Math.max(500, Math.ceil(actual / 500) * 500),
                            )
                          }
                        >
                          <Plus className="size-3" />
                          Set {formatCurrency(Math.max(500, Math.ceil(actual / 500) * 500))}
                        </Button>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Outings Breakdown (Trip, Temple, etc.) */}
                {isExpanded && isOutingCategory ? (
                  <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs space-y-2 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <span className="font-semibold text-sky-800 dark:text-sky-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <Compass className="size-3.5 text-sky-500" />
                        Outings &amp; Trips Breakdown
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono font-medium">
                        Total: {formatCurrency(actual)}
                      </span>
                    </div>

                    {outingBreakdown.trips.length === 0 && outingBreakdown.standalone === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-1">
                        No outing trips recorded for this month.
                      </p>
                    ) : (
                      <div className="space-y-1.5 divide-y divide-border/40">
                        {outingBreakdown.trips.map((trip) => (
                          <div
                            key={trip.name}
                            className="flex items-center justify-between pt-1.5 first:pt-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-foreground truncate">
                                {trip.name}
                              </span>
                              {trip.category ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 font-normal"
                                >
                                  {trip.category}
                                </Badge>
                              ) : null}
                              {trip.count > 1 ? (
                                <span className="text-[10px] text-muted-foreground">
                                  ({trip.count} expenses)
                                </span>
                              ) : null}
                            </div>
                            <span className="font-mono font-semibold text-foreground tabular-nums ml-2 shrink-0">
                              {formatCurrency(trip.total)}
                            </span>
                          </div>
                        ))}
                        {outingBreakdown.standalone > 0 ? (
                          <div className="flex items-center justify-between pt-1.5">
                            <span className="text-muted-foreground truncate">
                              Other Outing Expenses
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {formatCurrency(outingBreakdown.standalone)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Top Expenses Drawer */}
                {isExpanded && (!isOutingCategory || topSpenders.length > 0) ? (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs space-y-1.5 animate-in fade-in-50 duration-150">
                    <span className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
                      {isOutingCategory ? "Recent Outing Transactions" : `Top Expenses in ${item.category}`}
                    </span>
                    {topSpenders.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-1">
                        No expenses recorded yet.
                      </p>
                    ) : (
                      topSpenders.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between text-[11px]">
                          <span className="truncate text-foreground font-medium">
                            {tx.merchant || tx.title || "Expense"}
                          </span>
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
      )}
    </div>
  );
}
