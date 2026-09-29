"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Compass,
  ChevronDown,
  ChevronUp,
  Target,
  ArrowRight,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPlanMonth } from "@/lib/plan";
import { cn, formatCurrency } from "@/lib/utils";
import { usePurposes } from "@/hooks/usePurposes";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { useAllMonthlyPlansQuery } from "@/hooks/useMonthlyPlanQuery";
import { computePlanVsActual } from "@/lib/analytics";
import {
  getActivePurposes,
  getPurposeById,
  isPersonalPurposeRef,
  PERSONAL_PURPOSE_ID,
} from "@/lib/purposes";
import type { Outing, MonthlyPlan } from "@/types";

export type PlanVsActualRow = {
  category: string;
  planned: number;
  actual: number;
  color: string;
  status: "under" | "over";
};

type PlanVsActualTableProps = {
  rows?: PlanVsActualRow[];
  planMonth?: string;
  outings?: Outing[];
  purposeId?: string;
  onPurposeChange?: (purposeId: string) => void;
};

type FilterTab = "all" | "over" | "on-track" | "unbudgeted";
type SortOption = "actual-desc" | "variance-desc" | "name-asc";

function formatVariance(planned: number, actual: number) {
  const variance = actual - planned;
  if (variance === 0) return "₹0";
  return variance > 0
    ? `-₹${variance.toLocaleString("en-IN")}`
    : `+₹${Math.abs(variance).toLocaleString("en-IN")}`;
}

export function PlanVsActualTable({
  rows: initialRows,
  planMonth = "",
  outings = [],
  purposeId: externalPurposeId = "",
  onPurposeChange,
}: PlanVsActualTableProps) {
  // Sync local purpose selection with external or allow local toggle
  const [selectedPurposeId, setSelectedPurposeId] = useState<string>(externalPurposeId);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortOption>("actual-desc");
  const [expandedOutings, setExpandedOutings] = useState(false);

  useEffect(() => {
    setSelectedPurposeId(externalPurposeId);
  }, [externalPurposeId]);

  const { purposes } = usePurposes();
  const { categories } = useCategories();
  const { transactions } = useTransactions();
  const { data: allMonthlyPlans = [] } = useAllMonthlyPlansQuery();

  const activePurposes = useMemo(() => getActivePurposes(purposes), [purposes]);

  // Handle purpose switch
  const handlePurposeClick = (pId: string) => {
    setSelectedPurposeId(pId);
    if (onPurposeChange) {
      onPurposeChange(pId);
    }
  };

  // Find or combine monthly plans for this month
  const activePlan = useMemo<MonthlyPlan | null>(() => {
    if (!planMonth) return null;
    const monthPlans = allMonthlyPlans.filter((p) => p.month === planMonth);
    if (monthPlans.length === 0) return null;

    // "Total (All Purposes)" selected
    if (!selectedPurposeId) {
      if (monthPlans.length === 1) return monthPlans[0];

      const allocationMap = new Map<string, { plannedAmount: number; color: string; category: string }>();
      let totalBudget = 0;

      for (const plan of monthPlans) {
        totalBudget += plan.totalPlanned || plan.allocations.reduce((s, a) => s + a.plannedAmount, 0);
        for (const alloc of plan.allocations) {
          const existing = allocationMap.get(alloc.category);
          if (existing) {
            existing.plannedAmount += alloc.plannedAmount;
          } else {
            allocationMap.set(alloc.category, {
              category: alloc.category,
              plannedAmount: alloc.plannedAmount,
              color: alloc.color,
            });
          }
        }
      }

      return {
        id: `combined-${planMonth}`,
        userId: "",
        month: planMonth,
        purposeId: "", // Combined: counts all purpose transactions
        expectedIncome: monthPlans.reduce((sum, p) => sum + (p.expectedIncome || 0), 0),
        totalPlanned: totalBudget,
        allocations: Array.from(allocationMap.values()).map((a, i) => ({
          id: `alloc-${i}`,
          category: a.category,
          plannedAmount: a.plannedAmount,
          color: a.color,
        })),
        createdAt: "",
        updatedAt: "",
      };
    }

    // Specific purpose selected
    return (
      monthPlans.find(
        (p) =>
          p.purposeId === selectedPurposeId ||
          (!p.purposeId && isPersonalPurposeRef(selectedPurposeId, purposes)),
      ) ?? null
    );
  }, [allMonthlyPlans, planMonth, selectedPurposeId, purposes]);

  // Compute rows dynamically based on the selected purpose type
  const effectiveRows = useMemo<PlanVsActualRow[]>(() => {
    if (activePlan) {
      return computePlanVsActual(transactions, activePlan, purposes, categories);
    }
    // Fallback to initialRows if provided and no activePlan found
    if (!selectedPurposeId && initialRows && initialRows.length > 0) {
      return initialRows;
    }
    return [];
  }, [activePlan, transactions, purposes, categories, selectedPurposeId, initialRows]);

  // Current purpose label for display
  const currentPurposeLabel = useMemo(() => {
    if (!selectedPurposeId) return "Total (All Purposes)";
    const found = getPurposeById(purposes, selectedPurposeId);
    return found ? found.name : "Custom Purpose";
  }, [selectedPurposeId, purposes]);

  // Current purpose color
  const currentPurposeColor = useMemo(() => {
    if (!selectedPurposeId) return undefined;
    const found = getPurposeById(purposes, selectedPurposeId);
    return found?.color;
  }, [selectedPurposeId, purposes]);

  // Totals & high-level stats
  const totalPlanned = useMemo(() => effectiveRows.reduce((sum, row) => sum + row.planned, 0), [effectiveRows]);
  const totalActual = useMemo(() => effectiveRows.reduce((sum, row) => sum + row.actual, 0), [effectiveRows]);
  const totalIsOver = totalActual > totalPlanned;
  const netVariance = totalActual - totalPlanned;
  const utilizationRate = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const remainingCushion = Math.max(0, totalPlanned - totalActual);

  // Categorized row sets
  const overBudgetRows = useMemo(
    () => effectiveRows.filter((r) => r.planned > 0 && r.actual > r.planned),
    [effectiveRows],
  );
  const onTrackRows = useMemo(
    () => effectiveRows.filter((r) => r.planned > 0 && r.actual <= r.planned),
    [effectiveRows],
  );
  const unbudgetedRows = useMemo(
    () => effectiveRows.filter((r) => r.planned === 0 && r.actual > 0),
    [effectiveRows],
  );
  const unbudgetedTotal = useMemo(
    () => unbudgetedRows.reduce((sum, r) => sum + r.actual, 0),
    [unbudgetedRows],
  );

  // Top overspending category
  const topOverspend = useMemo(() => {
    if (overBudgetRows.length === 0) return null;
    return [...overBudgetRows].sort(
      (a, b) => b.actual - b.planned - (a.actual - a.planned),
    )[0];
  }, [overBudgetRows]);

  // Outings that occurred in this plan month
  const monthOutings = useMemo(() => {
    if (!planMonth || outings.length === 0) return outings;
    return outings.filter((o) => {
      const start = o.startDate || "";
      const end = o.endDate || "";
      const matchesMonth = start.startsWith(planMonth) || end.startsWith(planMonth);
      if (!matchesMonth) return false;
      if (selectedPurposeId && o.purposeId && o.purposeId !== selectedPurposeId) return false;
      return true;
    });
  }, [outings, planMonth, selectedPurposeId]);

  // Filtered and sorted rows for table
  const displayedRows = useMemo(() => {
    let list = effectiveRows;
    if (activeTab === "over") {
      list = effectiveRows.filter((r) => r.planned > 0 && r.actual > r.planned);
    } else if (activeTab === "on-track") {
      list = effectiveRows.filter((r) => r.planned > 0 && r.actual <= r.planned);
    } else if (activeTab === "unbudgeted") {
      list = effectiveRows.filter((r) => r.planned === 0 && r.actual > 0);
    }

    return [...list].sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.category.localeCompare(b.category);
      }
      if (sortBy === "variance-desc") {
        const varA = a.actual - a.planned;
        const varB = b.actual - b.planned;
        return varB - varA;
      }
      return b.actual - a.actual;
    });
  }, [effectiveRows, activeTab, sortBy]);

  return (
    <div className="sx-surface p-6 space-y-6">
      {/* Header with Title, Month, Purpose Badge & Link */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Plan vs Actual</h3>
            {planMonth && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {formatPlanMonth(planMonth)}
              </span>
            )}
            <Badge
              variant="outline"
              className="inline-flex items-center gap-1.5 border-border bg-muted/40 text-xs font-normal"
            >
              {currentPurposeColor ? (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: currentPurposeColor }}
                />
              ) : (
                <Layers className="size-3 text-primary" />
              )}
              <span className="font-medium text-foreground">{currentPurposeLabel}</span>
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare planned monthly allocations against real spending and track budget pace.
          </p>
        </div>

        <Link
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted text-foreground transition-colors sm:self-auto"
          href={
            planMonth
              ? `/plan?month=${planMonth}${selectedPurposeId ? `&purposeId=${selectedPurposeId}` : ""}`
              : "/plan"
          }
        >
          <span>Adjust Plan</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Purpose Type Selector Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-2.5 border">
        <span className="text-xs font-medium text-muted-foreground pl-1 mr-1 flex items-center gap-1.5">
          <Layers className="size-3.5" />
          <span>Purpose Type:</span>
        </span>

        {/* Total (All Purposes) button */}
        <button
          type="button"
          onClick={() => handlePurposeClick("")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
            !selectedPurposeId
              ? "border border-primary bg-primary text-primary-foreground shadow-xs"
              : "border border-transparent bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground",
          )}
        >
          Total (All Purposes)
        </button>

        {/* Individual Purpose Chips */}
        {activePurposes.map((purpose) => {
          const isActive = selectedPurposeId === purpose.id;
          return (
            <button
              key={purpose.id}
              type="button"
              onClick={() => handlePurposeClick(purpose.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                isActive
                  ? "text-white shadow-xs font-semibold"
                  : "border border-transparent bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground",
              )}
              style={
                isActive
                  ? {
                      backgroundColor: purpose.color,
                      borderColor: purpose.color,
                    }
                  : undefined
              }
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: isActive ? "#ffffff" : purpose.color }}
              />
              <span>{purpose.name}</span>
            </button>
          );
        })}
      </div>

      {effectiveRows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center">
          <Wallet className="mx-auto size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">
            No plan set for {currentPurposeLabel} in {planMonth ? formatPlanMonth(planMonth) : "this month"}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your category limits on the Plan page to compare against actual spending.
          </p>
          <Link
            className="mt-4 inline-flex h-8 items-center rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted"
            href={
              planMonth
                ? `/plan?month=${planMonth}&purposeId=${selectedPurposeId || PERSONAL_PURPOSE_ID}`
                : "/plan"
            }
          >
            Create {currentPurposeLabel} Plan →
          </Link>
        </div>
      ) : (
        <>
          {/* Quick Stats Grid (4 Metric Cards) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Budget Utilization */}
            <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Budget Utilized</span>
                <Wallet className="size-4 text-primary" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {utilizationRate}%
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  of {formatCurrency(totalPlanned)}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    utilizationRate > 100
                      ? "bg-rose-500"
                      : utilizationRate >= 80
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground font-mono">
                {formatCurrency(totalActual)} total spent
              </p>
            </div>

            {/* Card 2: Net Cushion / Overrun */}
            <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">
                  {totalIsOver ? "Budget Overrun" : "Remaining Cushion"}
                </span>
                {totalIsOver ? (
                  <AlertTriangle className="size-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-2xl font-bold tracking-tight font-mono",
                    totalIsOver
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatCurrency(totalIsOver ? netVariance : remainingCushion)}
                </span>
              </div>
              <p className="mt-3.5 text-[11px] text-muted-foreground">
                {totalIsOver
                  ? "Spending exceeded planned total"
                  : "Safe cushion remaining this month"}
              </p>
            </div>

            {/* Card 3: Top Overspend Area */}
            <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Overspend Alert</span>
                {topOverspend ? (
                  <TrendingUp className="size-4 text-rose-500" />
                ) : (
                  <ShieldCheck className="size-4 text-emerald-500" />
                )}
              </div>
              <div className="mt-2">
                {topOverspend ? (
                  <>
                    <p className="text-lg font-semibold truncate text-foreground">
                      {topOverspend.category}
                    </p>
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-mono font-medium">
                      +₹{(topOverspend.actual - topOverspend.planned).toLocaleString("en-IN")} over
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {overBudgetRows.length} {overBudgetRows.length === 1 ? "category" : "categories"} over limit
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      100% On Plan
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      All {onTrackRows.length} budgeted categories within limits
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Card 4: Unbudgeted Spending */}
            <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Unbudgeted Spend</span>
                <Target className="size-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {formatCurrency(unbudgetedTotal)}
                </span>
              </div>
              <p className="mt-3.5 text-[11px] text-muted-foreground">
                {unbudgetedRows.length > 0
                  ? `Across ${unbudgetedRows.length} ${unbudgetedRows.length === 1 ? "category" : "categories"} with no limit set`
                  : "All active categories have budgeted limits"}
              </p>
            </div>
          </div>

          {/* Filter Chips & Sort Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                All ({effectiveRows.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("over")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === "over"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>Over Budget</span>
                {overBudgetRows.length > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px]",
                      activeTab === "over"
                        ? "bg-white/20 text-white"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold",
                    )}
                  >
                    {overBudgetRows.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("on-track")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === "on-track"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>On Track</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    activeTab === "on-track"
                      ? "bg-white/20 text-white"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold",
                  )}
                >
                  {onTrackRows.length}
                </span>
              </button>

              {unbudgetedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("unbudgeted")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === "unbudgeted"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span>No Limit</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px]",
                      activeTab === "unbudgeted"
                        ? "bg-white/20 text-white"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold",
                    )}
                  >
                    {unbudgetedRows.length}
                  </span>
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="actual-desc">Highest Spend</option>
                <option value="variance-desc">Most Over Budget</option>
                <option value="name-asc">Category (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Planned</th>
                  <th className="px-3 py-2.5 text-right">Actual</th>
                  <th className="px-3 py-2.5 min-w-[140px]">Adherence</th>
                  <th className="px-3 py-2.5 text-right">Variance</th>
                  <th className="px-3 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No categories match this filter.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const isOver = row.status === "over";
                    const notStarted = row.actual === 0;
                    const hasLimit = row.planned > 0;
                    const percent = hasLimit ? Math.round((row.actual / row.planned) * 100) : null;
                    const isOutings = row.category.toLowerCase() === "outings" || row.category.toLowerCase() === "outing";

                    return (
                      <tr key={row.category} className="hover:bg-muted/30 transition-colors group">
                        {/* Category */}
                        <td className="px-3 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: row.color }}
                            />
                            <span className="truncate">{row.category}</span>
                            {isOutings && (
                              <button
                                type="button"
                                onClick={() => setExpandedOutings((prev) => !prev)}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                                title="Click to view outings in this month"
                              >
                                <Compass className="size-3" />
                                <span>{monthOutings.length} {monthOutings.length === 1 ? "Trip" : "Trips"}</span>
                                {expandedOutings ? (
                                  <ChevronUp className="size-2.5" />
                                ) : (
                                  <ChevronDown className="size-2.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Planned */}
                        <td className="px-3 py-3 text-right font-mono">
                          {hasLimit ? (
                            formatCurrency(row.planned)
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No limit</span>
                          )}
                        </td>

                        {/* Actual */}
                        <td className="px-3 py-3 text-right font-mono font-medium text-foreground">
                          {formatCurrency(row.actual)}
                        </td>

                        {/* Adherence Progress Bar */}
                        <td className="px-3 py-3">
                          {hasLimit ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    percent! > 100
                                      ? "bg-rose-500"
                                      : percent! >= 80
                                        ? "bg-amber-500"
                                        : "bg-emerald-500",
                                  )}
                                  style={{ width: `${Math.min(percent!, 100)}%` }}
                                />
                              </div>
                              <span
                                className={cn(
                                  "w-10 text-right font-mono text-xs font-medium",
                                  percent! > 100
                                    ? "text-rose-600 dark:text-rose-400 font-bold"
                                    : percent! >= 80
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {percent}%
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                              <span className="text-[11px] italic">Unbudgeted</span>
                            </div>
                          )}
                        </td>

                        {/* Variance */}
                        <td
                          className={cn(
                            "px-3 py-3 text-right font-mono font-medium",
                            !hasLimit
                              ? "text-muted-foreground"
                              : isOver
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {hasLimit ? formatVariance(row.planned, row.actual) : "—"}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-right">
                          {notStarted ? (
                            <Badge variant="secondary">Not started</Badge>
                          ) : !hasLimit ? (
                            <Badge variant="outline">
                              No limit
                            </Badge>
                          ) : isOver ? (
                            <Badge variant="destructive">
                              Over plan
                            </Badge>
                          ) : percent && percent >= 80 ? (
                            <Badge variant="warning">
                              Near cap
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              On track
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Total Footer */}
              <tfoot>
                <tr className="border-t font-semibold bg-muted/20">
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {formatCurrency(totalPlanned)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {formatCurrency(totalActual)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            totalIsOver ? "bg-rose-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                        {utilizationRate}%
                      </span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 text-right font-mono font-bold",
                      totalIsOver
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {formatVariance(totalPlanned, totalActual)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {totalIsOver ? (
                      <Badge variant="destructive">
                        Over Budget
                      </Badge>
                    ) : (
                      <Badge variant="success">
                        Healthy
                      </Badge>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Outings Details Drawer when expanded */}
          {expandedOutings && monthOutings.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Outings in {planMonth ? formatPlanMonth(planMonth) : "this period"}
                    {selectedPurposeId && ` • ${currentPurposeLabel}`}
                  </span>
                </div>
                <Link
                  href="/outings"
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>View All Outings</span>
                  <ArrowRight className="size-3" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {monthOutings.map((outing) => (
                  <div
                    key={outing.id}
                    className="flex flex-col justify-between rounded-lg border bg-background/90 p-3 shadow-2xs"
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground truncate">{outing.name}</p>
                      {outing.location && (
                        <p className="text-[11px] text-muted-foreground truncate">{outing.location}</p>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs pt-1.5 border-t border-dashed">
                      <span className="text-muted-foreground font-mono text-[11px]">{outing.startDate}</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatCurrency(outing.totalSpent ?? outing.budget ?? 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}