"use client";

import { ChevronRight, Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Outing, OutingExpense } from "@/types";

type OutingExpenseListProps = {
  expenses: OutingExpense[];
  outing: Outing;
  onSelect?: (expense: OutingExpense) => void;
};

export function OutingExpenseList({
  expenses,
  outing,
  onSelect,
}: OutingExpenseListProps) {
  const currentMemberId =
    outing.members.find((member) => member.isCurrentUser)?.id ??
    outing.members[0]?.id;

  return (
    <div className="divide-y divide-border/50">
      {expenses.map((expense) => {
        const involved =
          expense.paidByMemberId === currentMemberId ||
          expense.splits.some((split) => split.memberId === currentMemberId);
        const payer =
          outing.members.find((member) => member.id === expense.paidByMemberId)
            ?.name ?? "Member";
        const isSplit = expense.splitType !== "solo" && expense.splits.length > 1;
        const splitNames = isSplit
          ? expense.splits
              .map(
                (split) =>
                  outing.members.find((member) => member.id === split.memberId)
                    ?.name,
              )
              .filter(Boolean)
              .join(", ")
          : "";

        return (
          <button
            key={expense.id}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60 sm:px-5",
              involved && "bg-primary/[0.03]",
            )}
            type="button"
            onClick={() => onSelect?.(expense)}
          >
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                involved ? "bg-primary/15" : "bg-primary/10",
              )}
            >
              <Receipt className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {expense.description}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {formatDate(expense.date)} · {payer} paid · {expense.category}
                {expense.accountName
                  ? ` · ${expense.accountName}`
                  : expense.paymentMode
                    ? ` · ${expense.paymentMode}`
                    : ""}
              </p>
              {isSplit ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    Split
                  </span>{" "}
                  · {splitNames}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-semibold text-foreground">
                {formatCurrency(expense.amount)}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </div>
          </button>
        );
      })}
    </div>
  );
}