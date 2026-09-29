"use client";

import { Compass, Copy, IndianRupee, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPlanMonth, sumPlanned, type RolloverBreakdown } from "@/lib/plan";
import { cn, formatCurrency } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/transaction-ui";
import type { PlanAllocation } from "@/types";

type PlanAllocationSheetProps = {
  open: boolean;
  month: string;
  expectedIncome: number;
  onExpectedIncomeChange: (value: number) => void;
  incomeSuggestion: number;
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  rolloverBreakdowns?: Record<string, RolloverBreakdown>;
  isSaving: boolean;
  onAmountChange: (id: string, amount: number, categoryName?: string) => void;
  onToggleRollover?: (id: string) => void;
  onAddCategory: () => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
  hasPreviousSavedPlan?: boolean;
  previousMonthLabel?: string;
  onCopyFromPreviousPlan?: () => void;
};

function sanitizeAmount(value: string) {
  return value.replace(/\D/g, "");
}

function getRowStatus(effectiveAmount: number, actual: number) {
  if (actual <= 0) return "not-started" as const;
  if (actual > effectiveAmount) return "over" as const;
  return "on-track" as const;
}

export function PlanAllocationSheet({
  open,
  month,
  expectedIncome,
  onExpectedIncomeChange,
  incomeSuggestion,
  allocations,
  categorySpentActuals,
  rolloverBreakdowns,
  isSaving,
  onAmountChange,
  onToggleRollover,
  onAddCategory,
  onSave,
  onCancel,
  hasPreviousSavedPlan,
  previousMonthLabel,
  onCopyFromPreviousPlan,
}: PlanAllocationSheetProps) {
  // Ensure Outings category and any category where money was spent this month are shown in modal to set limits
  const allAllocations = useMemo(() => {
    const list = allocations.map((a) => ({
      ...a,
      category: a.category === "cat-exp-outings" ? "Outings" : a.category,
    }));
    const seen = new Set(list.map((a) => a.category.toLowerCase()));

    if (!seen.has("outings") && !seen.has("outing")) {
      seen.add("outings");
      list.push({
        id: "cat-exp-11",
        category: "Outings",
        plannedAmount: 0,
        color: "#0ea5e9",
      });
    }

    for (const [catName, spent] of Object.entries(categorySpentActuals)) {
      if (spent > 0 && !seen.has(catName.toLowerCase())) {
        seen.add(catName.toLowerCase());
        list.push({
          id: `unbudgeted-${catName}`,
          category: catName,
          plannedAmount: 0,
          color: "#94a3b8",
        });
      }
    }

    return list;
  }, [allocations, categorySpentActuals]);

  const totalPlanned = sumPlanned(allAllocations);
  const totalActual = Object.values(categorySpentActuals).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const overBy = totalPlanned - expectedIncome;
  const isOverAllocated = overBy > 0;
  const progress =
    expectedIncome > 0 ? Math.min(100, Math.round((totalPlanned / expectedIncome) * 100)) : 0;

  async function handleSave() {
    if (isOverAllocated) return;
    await onSave();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onCancel())}
    >
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-5 pt-6 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Plan for {formatPlanMonth(month)}
          </DialogTitle>
          <DialogDescription className="mt-1">
            Set your expected income, then allocate spending limits by
            category. Nothing is saved until you click Set &amp; Save Plan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5">
          <div>
            <Label className="text-sm font-medium" htmlFor="expected-income">
              Expected income this month
            </Label>
            <div className="relative mt-2 max-w-sm">
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9 font-mono text-lg"
                id="expected-income"
                inputMode="decimal"
                placeholder="₹ 0"
                value={expectedIncome || ""}
                onChange={(event) => onExpectedIncomeChange(Number(event.target.value) || 0)}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {incomeSuggestion > 0 && expectedIncome !== incomeSuggestion ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onExpectedIncomeChange(incomeSuggestion)}
                >
                  Use suggested income ({formatCurrency(incomeSuggestion)})
                </Button>
              ) : null}

              {hasPreviousSavedPlan && onCopyFromPreviousPlan ? (
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={onCopyFromPreviousPlan}
                >
                  <Copy className="size-3.5" />
                  Copy from {previousMonthLabel || "Last Month"}
                </Button>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "rounded-2xl border px-4 py-3",
              isOverAllocated
                ? "border-rose-500/30 bg-rose-500/10"
                : "border-emerald-500/30 bg-emerald-500/10",
            )}
          >
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span
                className={
                  isOverAllocated
                    ? "text-rose-800 dark:text-rose-200"
                    : "text-emerald-800 dark:text-emerald-200"
                }
              >
                Allocated: {formatCurrency(totalPlanned)} / {formatCurrency(expectedIncome)}
              </span>
              <span className="text-xs font-normal text-muted-foreground">{progress}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isOverAllocated ? "bg-rose-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            {isOverAllocated ? (
              <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                Allocations exceed expected income by {formatCurrency(overBy)}. Reduce some
                category amounts before saving.
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="px-6 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Estimated</th>
                  {onToggleRollover ? (
                    <>
                      <th className="px-4 py-3 text-right">Rolled</th>
                      <th className="px-4 py-3 text-right">Effective</th>
                    </>
                  ) : null}
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-6 py-3 text-right">Status</th>
                  {onToggleRollover ? (
                    <th className="px-4 py-3 text-center">Rollover</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {allAllocations.map((allocation) => (
                  <AllocationRow
                    key={allocation.id}
                    allocation={allocation}
                    actualSpent={categorySpentActuals[allocation.category] || 0}
                    rollover={rolloverBreakdowns?.[allocation.id]}
                    onAmountChange={onAmountChange}
                    onToggleRollover={onToggleRollover}
                  />
                ))}
                <tr className="bg-muted/20 font-semibold">
                  <td className="px-6 py-4">Total</td>
                  <td className="px-4 py-4 text-right font-mono">
                    {formatCurrency(totalPlanned)}
                  </td>
                  {onToggleRollover ? (
                    <>
                      <td className="px-4 py-4" />
                      <td className="px-4 py-4" />
                    </>
                  ) : null}
                  <td className="px-4 py-4 text-right font-mono">
                    {formatCurrency(totalActual)}
                  </td>
                  <td className="px-6 py-4" />
                  {onToggleRollover ? <td className="px-4 py-4" /> : null}
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <Button type="button" variant="outline" onClick={onAddCategory}>
              <Plus className="mr-2 size-4" />
              Add category
            </Button>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-end gap-3 border-t border-border bg-background px-6 py-5">
          <Button disabled={isSaving} type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={isSaving || isOverAllocated} type="button" onClick={handleSave}>
            <Save className="mr-2 size-4" />
            {isSaving ? "Saving…" : "Set & Save Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocationRow({
  allocation,
  actualSpent,
  rollover,
  onAmountChange,
  onToggleRollover,
}: {
  allocation: PlanAllocation;
  actualSpent: number;
  rollover?: RolloverBreakdown;
  onAmountChange: (id: string, amount: number, categoryName?: string) => void;
  onToggleRollover?: (id: string) => void;
}) {
  const [draftAmount, setDraftAmount] = useState(
    allocation.plannedAmount > 0 ? String(allocation.plannedAmount) : "",
  );
  const effectiveAmount = rollover?.effective ?? allocation.plannedAmount;
  const status = getRowStatus(effectiveAmount, actualSpent);
  const progress =
    effectiveAmount > 0
      ? Math.min(100, Math.round((actualSpent / effectiveAmount) * 100))
      : 0;

  useEffect(() => {
    setDraftAmount(
      allocation.plannedAmount > 0 ? String(allocation.plannedAmount) : "",
    );
  }, [allocation.id, allocation.plannedAmount]);

  function commitAmount(raw: string) {
    const sanitized = sanitizeAmount(raw);
    const nextAmount = sanitized === "" ? 0 : Number(sanitized);
    setDraftAmount(sanitized);
    onAmountChange(allocation.id, nextAmount, allocation.category);
  }

  const isOuting =
    allocation.category.toLowerCase() === "outings" ||
    allocation.category.toLowerCase() === "outing";
  const isUnbudgeted = allocation.plannedAmount === 0 && actualSpent > 0;
  const CategoryIcon = getCategoryIcon(allocation.icon || allocation.category);

  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          <span
            className="flex size-6 items-center justify-center rounded-md shrink-0 shadow-2xs font-bold"
            style={{
              backgroundColor: `${allocation.color}25`,
              color: allocation.color,
            }}
          >
            <CategoryIcon className="size-3.5" />
          </span>
          <span>{allocation.category}</span>
          {isOuting ? (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 font-normal text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 gap-1"
            >
              <Compass className="size-2.5" />
              Outing
            </Badge>
          ) : null}
          {isUnbudgeted ? (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 font-normal border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
            >
              No limit set
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              status === "over"
                ? "bg-rose-500"
                : status === "on-track" && progress > 80
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
            style={{ width: `${progress}%` }}
            title={
              effectiveAmount > 0
                ? `${formatCurrency(actualSpent)} of ${formatCurrency(effectiveAmount)} used (${progress}%)`
                : undefined
            }
          />
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <div className="relative inline-block">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            ₹
          </span>
          <Input
            className="h-9 w-28 pl-6 text-right font-mono text-sm"
            inputMode="numeric"
            placeholder="0"
            type="text"
            value={draftAmount}
            onBlur={() => commitAmount(draftAmount)}
            onChange={(event) => {
              const sanitized = sanitizeAmount(event.target.value);
              setDraftAmount(sanitized);
              if (sanitized !== "") {
                onAmountChange(allocation.id, Number(sanitized), allocation.category);
              }
            }}
          />
        </div>
        {isUnbudgeted && draftAmount === "" ? (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => commitAmount(String(actualSpent))}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              Match spent ({formatCurrency(actualSpent)})
            </button>
          </div>
        ) : null}
      </td>
      {onToggleRollover ? (
        <>
          <td className="px-4 py-4 text-right font-mono text-muted-foreground">
            {rollover && rollover.rolledOver > 0
              ? `+${formatCurrency(rollover.rolledOver)}`
              : "—"}
          </td>
          <td className="px-4 py-4 text-right font-mono font-semibold">
            {formatCurrency(effectiveAmount)}
          </td>
        </>
      ) : null}
      <td className="px-4 py-4 text-right font-mono">
        {formatCurrency(actualSpent)}
      </td>
      <td className="px-6 py-4 text-right">
        {status === "not-started" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : status === "over" ? (
          <Badge variant="destructive">
            Over plan
          </Badge>
        ) : (
          <Badge variant="success">
            On track
          </Badge>
        )}
      </td>
      {onToggleRollover ? (
        <td className="px-4 py-4 text-center">
          <input
            aria-label={`Roll over unused ${allocation.category} amount`}
            checked={Boolean(allocation.rollover)}
            className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
            type="checkbox"
            onChange={() => onToggleRollover(allocation.id)}
          />
        </td>
      ) : null}
    </tr>
  );
}
