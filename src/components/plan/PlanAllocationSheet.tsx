"use client";

import { IndianRupee, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
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
  onAmountChange: (id: string, amount: number) => void;
  onToggleRollover?: (id: string) => void;
  onAddCategory: () => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
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
}: PlanAllocationSheetProps) {
  const totalPlanned = sumPlanned(allocations);
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
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
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
            {incomeSuggestion > 0 && expectedIncome !== incomeSuggestion ? (
              <Button
                className="mt-3"
                type="button"
                variant="outline"
                onClick={() => onExpectedIncomeChange(incomeSuggestion)}
              >
                Use suggested income ({formatCurrency(incomeSuggestion)})
              </Button>
            ) : null}
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
                {allocations.map((allocation) => (
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
          <Button disabled={isSaving || isOverAllocated} onClick={handleSave}>
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
  onAmountChange: (id: string, amount: number) => void;
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
    onAmountChange(allocation.id, nextAmount);
  }

  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 font-medium">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: allocation.color }}
          />
          {allocation.category}
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
                onAmountChange(allocation.id, Number(sanitized));
              }
            }}
          />
        </div>
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
          <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
            Over plan
          </Badge>
        ) : (
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
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
