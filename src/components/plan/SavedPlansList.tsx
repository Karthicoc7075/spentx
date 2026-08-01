"use client";

import { CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MonthlyPlanActuals } from "@/lib/supabase-data";
import { getPlanDisplayTitle, sumPlanned } from "@/lib/plan";
import { getPurposeLabel } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import type { MonthlyPlan, Purpose } from "@/types";

type SavedPlansListProps = {
  plans: MonthlyPlan[];
  actualsByPlanId: Record<string, MonthlyPlanActuals>;
  purposes: Purpose[];
  currentMonth: string;
  currentPurposeId: string;
  onSelect: (plan: MonthlyPlan) => void;
};

export function SavedPlansList({
  plans,
  actualsByPlanId,
  purposes,
  currentMonth,
  currentPurposeId,
  onSelect,
}: SavedPlansListProps) {
  return (
    <div className="sx-surface">
      <div className="border-b px-6 py-4">
        <h3 className="text-base font-semibold text-foreground">Monthly History</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Plans you&apos;ve saved across every month. Click one to view or edit it.
        </p>
      </div>
      <div className="p-6">
        {plans.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No plans saved yet. Set up a plan above to build your monthly history.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((savedPlan) => {
              const isCurrent =
                savedPlan.month === currentMonth &&
                (savedPlan.purposeId ?? "") === (currentPurposeId ?? "");
              const totalPlanned = sumPlanned(savedPlan.allocations);
              const actuals = actualsByPlanId[savedPlan.id];
              const purposeName = savedPlan.purposeId
                ? getPurposeLabel(savedPlan.purposeId, purposes)
                : null;

              return (
                <button
                  key={savedPlan.id}
                  type="button"
                  className={cn(
                    "flex flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : "border-border/70 hover:border-border hover:bg-muted/50",
                  )}
                  onClick={() => onSelect(savedPlan)}
                >
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <CalendarCheck className="size-4 text-muted-foreground" />
                      {getPlanDisplayTitle(savedPlan)}
                      {purposeName ? (
                        <span className="font-normal text-muted-foreground">
                          · {purposeName}
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <Badge className="ml-0.5">Active</Badge>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Income {formatCurrency(savedPlan.expectedIncome)} · Planned{" "}
                      {formatCurrency(totalPlanned)}
                    </p>
                    {actuals ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Actual {formatCurrency(actuals.actualExpense)}
                        {actuals.variance > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {" "}
                            (+{formatCurrency(actuals.variance)} over)
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {" "}
                            ({formatCurrency(Math.abs(actuals.variance))} under)
                          </span>
                        )}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
