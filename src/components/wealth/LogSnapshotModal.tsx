"use client";

import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cn,
  compareTransactionsNewestFirst,
  formatCurrency,
  toCsv,
  transactionDateKey,
} from "@/lib/utils";
import { toCalendarDate } from "@/lib/date-filters";
import {
  isBalanceExcludedTransaction,
  transactionAmount,
} from "@/lib/wealth";
import { isTransferTransaction } from "@/lib/investments";
import type { Transaction } from "@/types";

type RangeType = "this-week" | "this-month" | "previous-month" | "custom";

type LogSnapshotModalProps = {
  transactions: Transaction[];
};

function getPreviousMonthOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = subMonths(now, index + 1);
    return {
      value: format(date, "yyyy-MM"),
      label: format(date, "MMM yyyy"),
    };
  });
}

export function LogSnapshotModal({ transactions }: LogSnapshotModalProps) {
  const [open, setOpen] = useState(false);
  const [rangeType, setRangeType] = useState<RangeType>("this-week");
  const previousMonthOptions = useMemo(() => getPreviousMonthOptions(), []);
  const [previousMonth, setPreviousMonth] = useState(
    previousMonthOptions[0]?.value ?? "",
  );
  const [customFrom, setCustomFrom] = useState(toCalendarDate(new Date()));
  const [customTo, setCustomTo] = useState(toCalendarDate(new Date()));

  const { dateFrom, dateTo, rangeLabel } = useMemo(() => {
    const now = new Date();

    if (rangeType === "this-week") {
      return {
        dateFrom: toCalendarDate(startOfWeek(now, { weekStartsOn: 1 })),
        dateTo: toCalendarDate(endOfWeek(now, { weekStartsOn: 1 })),
        rangeLabel: "This week",
      };
    }

    if (rangeType === "this-month") {
      return {
        dateFrom: toCalendarDate(startOfMonth(now)),
        dateTo: toCalendarDate(endOfMonth(now)),
        rangeLabel: "This month",
      };
    }

    if (rangeType === "previous-month") {
      const [year, month] = previousMonth.split("-").map(Number);
      const monthDate = new Date(year, (month ?? 1) - 1, 1);
      const label =
        previousMonthOptions.find((option) => option.value === previousMonth)
          ?.label ?? "Previous month";
      return {
        dateFrom: toCalendarDate(startOfMonth(monthDate)),
        dateTo: toCalendarDate(endOfMonth(monthDate)),
        rangeLabel: label,
      };
    }

    return {
      dateFrom: customFrom,
      dateTo: customTo,
      rangeLabel: "Custom range",
    };
  }, [rangeType, previousMonth, previousMonthOptions, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    return transactions
      .filter((transaction) => {
        // Hide display-only / transfer noise from the log (same idea as NW).
        if (isBalanceExcludedTransaction(transaction)) return false;
        if (isTransferTransaction(transaction)) return false;
        const day = toCalendarDate(transactionDateKey(transaction));
        return Boolean(day) && day >= dateFrom && day <= dateTo;
      })
      .sort(compareTransactionsNewestFirst);
  }, [transactions, dateFrom, dateTo]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const transaction of filtered) {
      const amount = transactionAmount(transaction);
      if (transaction.type === "income") income += amount;
      else expense += amount;
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  function handleExport() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `log-snapshot-${dateFrom}-to-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <History className="mr-2 size-4" />
            Log snapshot
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log snapshot</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "this-week", label: "This week" },
              { value: "this-month", label: "This month" },
              { value: "previous-month", label: "Previous months" },
              { value: "custom", label: "Custom" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                rangeType === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
              type="button"
              onClick={() => setRangeType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {rangeType === "previous-month" ? (
          <div className="grid gap-2">
            <Label htmlFor="previous-month">Month</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              id="previous-month"
              value={previousMonth}
              onChange={(event) => setPreviousMonth(event.target.value)}
            >
              {previousMonthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {rangeType === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="custom-from">From</Label>
              <Input
                id="custom-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-to">To</Label>
              <Input
                id="custom-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <span className="font-medium text-foreground">{rangeLabel}</span>
            <span className="ml-2 text-muted-foreground">
              {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-emerald-600 dark:text-emerald-400">
              In {formatCurrency(summary.income)}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              Out {formatCurrency(summary.expense)}
            </span>
            <span className="font-medium text-foreground">
              Net {formatCurrency(summary.net)}
            </span>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions in this range.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {transaction.merchant}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {format(new Date(transactionDateKey(transaction)), "dd MMM yyyy")}
                      <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                        {transaction.category}
                      </Badge>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold",
                      transaction.type === "income"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400",
                    )}
                  >
                    {transaction.type === "income" ? "+" : "-"}
                    {formatCurrency(transactionAmount(transaction))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            disabled={filtered.length === 0}
            size="sm"
            type="button"
            variant="outline"
            onClick={handleExport}
          >
            Export CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
