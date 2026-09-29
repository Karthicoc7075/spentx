"use client";

import { useState, useMemo } from "react";
import { CalendarCheck, Copy, Layers, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MonthlyPlanActuals } from "@/lib/supabase-data";
import { formatPlanMonth, getPlanDisplayTitle, sumPlanned } from "@/lib/plan";
import { getPurposeLabel, PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import type { MonthlyPlan, Purpose } from "@/types";

type SavedPlansListProps = {
  plans: MonthlyPlan[];
  actualsByPlanId: Record<string, MonthlyPlanActuals>;
  purposes: Purpose[];
  currentMonth: string;
  currentPurposeId: string;
  onSelect: (plan: MonthlyPlan) => void;
  onCopyPlan?: (plan: MonthlyPlan) => void;
};

export function SavedPlansList({
  plans,
  actualsByPlanId,
  purposes,
  currentMonth,
  currentPurposeId,
  onSelect,
  onCopyPlan,
}: SavedPlansListProps) {
  // Purpose filter: "current", "all", or specific purpose id
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState<string>("current");

  const currentPurposeName = useMemo(() => {
    return getPurposeLabel(currentPurposeId || PERSONAL_PURPOSE_ID, purposes);
  }, [currentPurposeId, purposes]);

  // Filter plans based on the selected purpose tab
  const filteredPlans = useMemo(() => {
    if (selectedPurposeFilter === "all") {
      return plans;
    }
    if (selectedPurposeFilter === "current") {
      return plans.filter((p) => {
        const pId = p.purposeId || PERSONAL_PURPOSE_ID;
        const curId = currentPurposeId || PERSONAL_PURPOSE_ID;
        return pId === curId;
      });
    }
    return plans.filter((p) => (p.purposeId || PERSONAL_PURPOSE_ID) === selectedPurposeFilter);
  }, [plans, selectedPurposeFilter, currentPurposeId]);

  // Purpose counts for tabs
  const purposeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of plans) {
      const id = p.purposeId || PERSONAL_PURPOSE_ID;
      map[id] = (map[id] || 0) + 1;
    }
    return map;
  }, [plans]);

  const currentPurposeCount = useMemo(() => {
    const curId = currentPurposeId || PERSONAL_PURPOSE_ID;
    return purposeCounts[curId] || 0;
  }, [purposeCounts, currentPurposeId]);

  return (
    <div className="sx-surface space-y-4 p-6">
      {/* Header and Explanation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Monthly History</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {filteredPlans.length} {filteredPlans.length === 1 ? "plan" : "plans"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Review past monthly plans for each purpose. Click any card to edit, or quickly copy past limits into {formatPlanMonth(currentMonth)}.
          </p>
        </div>
      </div>

      {/* Purpose Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
          <Layers className="size-3" />
          Filter:
        </span>

        <button
          type="button"
          onClick={() => setSelectedPurposeFilter("current")}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
            selectedPurposeFilter === "current"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {currentPurposeName} ({currentPurposeCount})
        </button>

        <button
          type="button"
          onClick={() => setSelectedPurposeFilter("all")}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
            selectedPurposeFilter === "all"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          All Purposes ({plans.length})
        </button>

        {purposes.map((p) => {
          if (p.id === (currentPurposeId || PERSONAL_PURPOSE_ID)) return null;
          const count = purposeCounts[p.id] || 0;
          if (count === 0) return null;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPurposeFilter(p.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                selectedPurposeFilter === p.id
                  ? "text-white shadow-xs font-semibold"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              style={selectedPurposeFilter === p.id ? { backgroundColor: p.color } : undefined}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: selectedPurposeFilter === p.id ? "#ffffff" : p.color }}
              />
              <span>{p.name} ({count})</span>
            </button>
          );
        })}
      </div>

      {filteredPlans.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No saved plans found for this filter.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a monthly plan to build your historical record.
          </p>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPlans.map((savedPlan) => {
            const isCurrent =
              savedPlan.month === currentMonth &&
              (savedPlan.purposeId ?? PERSONAL_PURPOSE_ID) ===
                (currentPurposeId ?? PERSONAL_PURPOSE_ID);
            const isDifferentMonth = savedPlan.month !== currentMonth;
            const totalPlanned = sumPlanned(savedPlan.allocations);
            const actuals = actualsByPlanId[savedPlan.id];
            const pId = savedPlan.purposeId || PERSONAL_PURPOSE_ID;
            const purpose = purposes.find((p) => p.id === pId);
            const purposeName = getPurposeLabel(pId, purposes);

            return (
              <div
                key={savedPlan.id}
                className={cn(
                  "group relative flex flex-col justify-between rounded-xl border p-4.5 transition-all text-left bg-card/60 hover:bg-card/90",
                  isCurrent
                    ? "border-primary/50 bg-primary/5 shadow-xs ring-1 ring-primary/20"
                    : "border-border/70 hover:border-border hover:shadow-xs",
                )}
              >
                <div>
                  {/* Top Bar with Title & Purpose Pill */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(savedPlan)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors text-left"
                    >
                      <CalendarCheck className="size-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                      <span className="truncate">{getPlanDisplayTitle(savedPlan)}</span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold">
                          Active
                        </Badge>
                      )}
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border"
                        style={{
                          borderColor: purpose?.color ? `${purpose.color}40` : undefined,
                          backgroundColor: purpose?.color ? `${purpose.color}15` : undefined,
                          color: purpose?.color || "inherit",
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: purpose?.color || "#64748b" }}
                        />
                        {purposeName}
                      </span>
                    </div>
                  </div>

                  {/* Planned & Actual Amounts */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-[11px] text-muted-foreground block">Planned Budget</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(totalPlanned)}
                      </span>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="text-[11px] text-muted-foreground block">Actual Spent</span>
                      <span className="font-mono font-semibold text-foreground">
                        {actuals ? formatCurrency(actuals.actualExpense) : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Variance pill */}
                  {actuals ? (
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground text-[11px]">Plan Variance:</span>
                      {actuals.variance > 0 ? (
                        <span className="font-mono font-medium text-rose-600 dark:text-rose-400 text-xs">
                          +{formatCurrency(actuals.variance)} over
                        </span>
                      ) : (
                        <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400 text-xs">
                          {formatCurrency(Math.abs(actuals.variance))} under
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(savedPlan)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    <span>View &amp; Edit</span>
                    <ArrowRight className="size-3" />
                  </button>

                  {/* Quick Copy to Current Month button */}
                  {isDifferentMonth && onCopyPlan ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyPlan(savedPlan);
                      }}
                      title={`Copy ${getPlanDisplayTitle(savedPlan)} budget limits into ${formatPlanMonth(currentMonth)}`}
                    >
                      <Copy className="size-3" />
                      <span>Use for {formatPlanMonth(currentMonth)}</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
