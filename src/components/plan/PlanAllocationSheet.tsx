"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import type { RolloverBreakdown } from "@/lib/plan";
import type { PlanAllocation } from "@/types";

type PlanAllocationSheetProps = {
  allocations: PlanAllocation[];
  categorySpentActuals: Record<string, number>;
  rolloverBreakdowns?: Record<string, RolloverBreakdown>;
  totalPlanned: number;
  totalActual: number;
  disabled?: boolean;
  onAmountChange: (id: string, amount: number) => void;
  onToggleRollover?: (id: string) => void;
  onAddCategory: () => void;
};

function sanitizeAmount(value: string) {
  return value.replace(/\D/g, "");
}

function getRowStatus(effectiveBudget: number, actual: number) {
  if (actual <= 0) return "not-started" as const;
  if (actual > effectiveBudget) return "over" as const;
  return "on-track" as const;
}

export function PlanAllocationSheet({
  allocations,
  categorySpentActuals,
  rolloverBreakdowns,
  totalPlanned,
  totalActual,
  disabled = false,
  onAmountChange,
  onToggleRollover,
  onAddCategory,
}: PlanAllocationSheetProps) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-4">
        <h3 className="text-base font-semibold text-foreground">Allocation Sheet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {disabled
            ? "This plan is locked. Click Edit plan to make changes."
            : "Set estimated spending limits by category. Toggle rollover to carry unused budget into next month."}
        </p>
      </div>

      <div className="overflow-x-auto">
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
                disabled={disabled}
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

      <div className="border-t px-6 py-4">
        <Button disabled={disabled} type="button" variant="outline" onClick={onAddCategory}>
          <Plus className="mr-2 size-4" />
          Add category
        </Button>
      </div>
    </div>
  );
}

function AllocationRow({
  allocation,
  actualSpent,
  rollover,
  disabled = false,
  onAmountChange,
  onToggleRollover,
}: {
  allocation: PlanAllocation;
  actualSpent: number;
  rollover?: RolloverBreakdown;
  disabled?: boolean;
  onAmountChange: (id: string, amount: number) => void;
  onToggleRollover?: (id: string) => void;
}) {
  const [draftAmount, setDraftAmount] = useState(
    allocation.plannedAmount > 0 ? String(allocation.plannedAmount) : "",
  );
  const effectiveBudget = rollover?.effective ?? allocation.plannedAmount;
  const status = getRowStatus(effectiveBudget, actualSpent);
  const progress =
    effectiveBudget > 0
      ? Math.min(100, Math.round((actualSpent / effectiveBudget) * 100))
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
              effectiveBudget > 0
                ? `${formatCurrency(actualSpent)} of ${formatCurrency(effectiveBudget)} used (${progress}%)`
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
            disabled={disabled}
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
            {formatCurrency(effectiveBudget)}
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
            Over budget
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
            aria-label={`Roll over unused ${allocation.category} budget`}
            checked={Boolean(allocation.rollover)}
            className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
            disabled={disabled}
            type="checkbox"
            onChange={() => onToggleRollover(allocation.id)}
          />
        </td>
      ) : null}
    </tr>
  );
}
