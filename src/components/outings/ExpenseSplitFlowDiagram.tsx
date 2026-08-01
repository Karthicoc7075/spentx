"use client";

import { ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils";
import type { OutingExpense, TripMember } from "@/types";

type ExpenseSplitFlowDiagramProps = {
  expense: OutingExpense;
  members: TripMember[];
};

/** Payer on the left, a connector fanning out to each member's resolved
 * share on the right — reads directly from `expense.splits`, which already
 * holds the resolved per-member amount regardless of how the split was
 * originally computed (equally/solo/custom), so this never needs its own
 * balance math. */
export function ExpenseSplitFlowDiagram({
  expense,
  members,
}: ExpenseSplitFlowDiagramProps) {
  const payer = members.find((member) => member.id === expense.paidByMemberId);

  return (
    <div className="flex items-start gap-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1">
        <Avatar className="size-11">
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">
            {(payer?.name ?? "?").charAt(0)}
          </AvatarFallback>
        </Avatar>
        <p className="max-w-16 truncate text-center text-xs font-medium text-foreground">
          {payer?.name ?? "Unknown"}
        </p>
        <p className="text-[11px] text-muted-foreground">Paid {formatCurrency(expense.amount)}</p>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5 pt-1">
        {expense.splits.map((split) => {
          const member = members.find((item) => item.id === split.memberId);
          return (
            <div key={split.memberId} className="flex items-center gap-2">
              <ArrowRight className="size-3.5 shrink-0 text-primary/60" />
              <div className="h-px flex-1 bg-primary/30" />
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                  {(member?.name ?? "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {member?.name ?? "Unknown"}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(split.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
