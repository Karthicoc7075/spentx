"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatCurrency } from "@/lib/utils";
import { useBalanceSnapshots } from "@/hooks/useBalanceSnapshots";
import type { useDailySnapshot } from "@/hooks/useDailySnapshot";
import type { Account } from "@/types";

type SnapshotHistorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ReturnType<typeof useDailySnapshot>;
  accounts: Account[];
};

type FilterRange = "today" | "7days" | "thisMonth" | "lastMonth" | "all";

function formatDayHeader(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SnapshotHistorySheet({
  open,
  onOpenChange,
  snapshot,
  accounts,
}: SnapshotHistorySheetProps) {
  const { history } = snapshot;
  const { snapshots: accountSnapshots } = useBalanceSnapshots();
  const [filter, setFilter] = useState<FilterRange>("7days");

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const now = new Date();
    const currentMonthKey = now.toISOString().slice(0, 7);

    // Calculate last month key
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = lastMonthDate.toISOString().slice(0, 7);

    return history.filter((item) => {
      if (filter === "today") return item.date === todayStr;
      if (filter === "7days") {
        const diffMs = now.getTime() - new Date(`${item.date}T00:00:00Z`).getTime();
        return diffMs <= 7 * 24 * 60 * 60 * 1000;
      }
      if (filter === "thisMonth") return item.date.startsWith(currentMonthKey);
      if (filter === "lastMonth") return item.date.startsWith(lastMonthKey);
      return true; // 'all'
    });
  }, [history, filter, todayStr]);

  function accountName(accountId: string) {
    return accounts.find((a) => a.id === accountId)?.name ?? "Account";
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-3 border-b border-border">
          <SheetTitle>Daily Snapshot History</SheetTitle>
          <SheetDescription>Historical daily account balances log</SheetDescription>
        </SheetHeader>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-1.5 px-6 py-3 border-b border-border bg-muted/20">
          {(
            [
              { key: "today", label: "Today" },
              { key: "7days", label: "Last 7 Days" },
              { key: "thisMonth", label: "This Month" },
              { key: "lastMonth", label: "Last Month" },
              { key: "all", label: "All" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === chip.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Snapshot List */}
        <div className="grid gap-4 px-6 py-5">
          {filteredHistory.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No snapshots found for this time range.
            </p>
          ) : (
            filteredHistory.map((dayRow) => {
              const dayAccountRows = accountSnapshots.filter(
                (row) => row.date === dayRow.date,
              );

              return (
                <div
                  key={dayRow.date}
                  className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <h4 className="text-xs font-bold text-foreground">
                      {formatDayHeader(dayRow.date)}
                    </h4>
                    <span className="font-mono font-bold text-xs text-primary">
                      Net Worth: {formatCurrency(dayRow.netWorth)}
                    </span>
                  </div>

                  {dayRow.investmentValue > 0 ? (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      <span>📈 Investment Total</span>
                      <span className="font-mono font-bold">{formatCurrency(dayRow.investmentValue)}</span>
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2">
                    {accounts.map((acc) => {
                      const match = dayAccountRows.find(
                        (r) =>
                          r.accountId === acc.id ||
                          r.accountId === acc.name ||
                          r.accountId.toLowerCase() === acc.name.toLowerCase(),
                      );
                      const balance = match ? match.balance : acc.openingBalance;
                      return (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">{acc.name}</span>
                          <span className="font-medium font-mono tabular-nums text-foreground">
                            {formatCurrency(balance)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
