"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Calendar,
  Search,
  X,
  Download,
  Landmark,
  Banknote,
  Wallet,
  CreditCard,
  ArrowRight,
  Sparkles,
  Plus,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, downloadCsv, formatCurrency } from "@/lib/utils";
import { getTodayCalendarDate, toCalendarDate } from "@/lib/date-filters";
import { formatNetChange, type DailyFinancialSnapshot } from "@/lib/wealth";
import type { Account } from "@/types";

type SnapshotFilterPreset =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "custom"
  | "all";

type DailySnapshotHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailySnapshots: DailyFinancialSnapshot[];
  accounts: Account[];
  onNewAccount?: () => void;
};

function getAccountTypeIcon(type?: string) {
  switch (type) {
    case "cash":
      return Banknote;
    case "wallet":
      return Wallet;
    case "credit":
      return CreditCard;
    default:
      return Landmark;
  }
}

export function DailySnapshotHistoryModal({
  open,
  onOpenChange,
  dailySnapshots,
  accounts,
  onNewAccount,
}: DailySnapshotHistoryModalProps) {
  const [preset, setPreset] = useState<SnapshotFilterPreset>("this-week");
  const [searchDate, setSearchDate] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toCalendarDate(d);
  });
  const [customTo, setCustomTo] = useState(() => getTodayCalendarDate());

  const todayStr = useMemo(() => getTodayCalendarDate(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toCalendarDate(d);
  }, []);

  const activeRange = useMemo(() => {
    const now = new Date();

    if (preset === "this-week") {
      const from = toCalendarDate(startOfWeek(now, { weekStartsOn: 1 }));
      const to = toCalendarDate(endOfWeek(now, { weekStartsOn: 1 }));
      return {
        from,
        to: to > todayStr ? todayStr : to,
        label: "This Week",
      };
    }

    if (preset === "last-week") {
      const from = toCalendarDate(
        startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      );
      const to = toCalendarDate(
        endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      );
      return { from, to, label: "Last Week" };
    }

    if (preset === "this-month") {
      const from = toCalendarDate(startOfMonth(now));
      const to = toCalendarDate(endOfMonth(now));
      return {
        from,
        to: to > todayStr ? todayStr : to,
        label: "This Month",
      };
    }

    if (preset === "last-month") {
      const from = toCalendarDate(startOfMonth(subMonths(now, 1)));
      const to = toCalendarDate(endOfMonth(subMonths(now, 1)));
      return { from, to, label: "Last Month" };
    }

    if (preset === "custom") {
      return {
        from: customFrom || "2000-01-01",
        to: customTo || todayStr,
        label: "Custom Range",
      };
    }

    return { from: "2000-01-01", to: todayStr, label: "All Time" };
  }, [preset, customFrom, customTo, todayStr]);

  // Filter snapshots to the selected range and search criteria
  const filteredSnapshots = useMemo(() => {
    if (!dailySnapshots.length) return [];

    return dailySnapshots.filter((item) => {
      // Must have at least one active account on that date
      if (item.accountBalances.length === 0) return false;

      if (searchDate.trim()) {
        const query = searchDate.trim().toLowerCase();
        return (
          item.date.includes(query) ||
          item.formattedDate.toLowerCase().includes(query)
        );
      }

      return item.date >= activeRange.from && item.date <= activeRange.to;
    });
  }, [dailySnapshots, activeRange, searchDate]);

  // Only accounts that actually existed on the currently viewed snapshot dates
  const activeAccountsInFilter = useMemo(() => {
    const presentAccountIds = new Set<string>();
    for (const snap of filteredSnapshots) {
      for (const b of snap.accountBalances) {
        presentAccountIds.add(b.accountId);
      }
    }
    return accounts.filter((a) => presentAccountIds.has(a.id));
  }, [filteredSnapshots, accounts]);

  // Executive summary metrics across the filtered period
  const summaryMetrics = useMemo(() => {
    if (filteredSnapshots.length === 0) return null;
    const latest = filteredSnapshots[0];
    const earliest = filteredSnapshots[filteredSnapshots.length - 1];
    const periodChange = latest.totalBalance - earliest.totalBalance;
    return {
      daysCount: filteredSnapshots.length,
      currentBalance: latest.totalBalance,
      periodChange,
      latestDate: latest.formattedDate,
      earliestDate: earliest.formattedDate,
    };
  }, [filteredSnapshots]);

  function handleExportCsv() {
    if (filteredSnapshots.length === 0) return;
    const exportAccounts =
      activeAccountsInFilter.length > 0 ? activeAccountsInFilter : accounts;
    const headers = [
      "Date",
      ...exportAccounts.map((a) => `"${a.name.replace(/"/g, '""')}"`),
      "Total",
      "Net Change",
    ];
    const rows = filteredSnapshots.map((snap) => {
      const accValues = exportAccounts.map((a) => {
        const match = snap.accountBalances.find((b) => b.accountId === a.id);
        return match ? match.balance : "—";
      });
      return [snap.date, ...accValues, snap.totalBalance, snap.netChange].join(
        ",",
      );
    });
    const csv = [headers.join(","), ...rows].join("\n");
    downloadCsv(
      `Daily_Snapshot_History_${activeRange.from}_to_${activeRange.to}.csv`,
      csv,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-1.25rem)] sm:w-full max-w-5xl lg:max-w-6xl max-h-[92vh] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border border-border shadow-xl bg-card"
      >
        {/* Header */}
        <DialogHeader className="p-3.5 sm:p-5 border-b border-border bg-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <CalendarClock className="size-4.5 sm:size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                  Daily Snapshot History
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
                  Automatic, transaction-based daily records of your complete financial position.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 sm:h-8.5 gap-1.5 text-xs font-medium border-border/80 hover:bg-muted shadow-2xs"
                onClick={handleExportCsv}
                disabled={filteredSnapshots.length === 0}
              >
                <Download className="size-3.5 text-muted-foreground" />
                <span className="hidden xs:inline">Export CSV</span>
                <span className="xs:hidden">Export</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 sm:size-8.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                onClick={() => onOpenChange(false)}
                title="Close"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Filter Toolbar */}
        <div className="border-b border-border bg-muted/20 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Presets: This Week, Last Week, This Month, Last Month, Custom, All */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap no-scrollbar">
              {(
                [
                  { key: "this-week", label: "This Week" },
                  { key: "last-week", label: "Last Week" },
                  { key: "this-month", label: "This Month" },
                  { key: "last-month", label: "Last Month" },
                  { key: "custom", label: "Custom" },
                  { key: "all", label: "All Time" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setPreset(chip.key);
                    setSearchDate("");
                  }}
                  className={cn(
                    "rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all shrink-0",
                    preset === chip.key && !searchDate
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Search for Date */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search date (e.g. 28 Sep)..."
                className="h-8 pl-8 pr-7 text-xs bg-card"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
              {searchDate ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchDate("")}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {preset === "custom" && !searchDate ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-2 pb-0.5 border-t border-border/60">
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-1 shadow-2xs">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">
                  From:
                </span>
                <Input
                  type="date"
                  className="h-7 w-32 text-xs bg-transparent border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-foreground"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <ArrowRight className="size-3 text-muted-foreground hidden sm:block" />
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-1 shadow-2xs">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">
                  To:
                </span>
                <Input
                  type="date"
                  className="h-7 w-32 text-xs bg-transparent border-0 p-0 shadow-none focus-visible:ring-0 font-mono text-foreground"
                  value={customTo}
                  min={customFrom}
                  max={todayStr}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {/* Range Summary Strip & View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {summaryMetrics ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card border border-border/80 px-2.5 sm:px-3.5 py-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary shrink-0" />
                  <span className="font-medium text-foreground truncate max-w-[130px] sm:max-w-none">
                    {searchDate ? `Search: "${searchDate}"` : activeRange.label}
                  </span>
                  <span className="text-muted-foreground text-[11px] sm:text-xs">
                    ({summaryMetrics.daysCount}d)
                  </span>
                </div>
                <div className="flex items-center gap-2.5 pl-2 border-l border-border/60">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-[11px] sm:text-xs">Close:</span>
                    <span className="font-mono font-bold text-foreground">
                      {formatCurrency(summaryMetrics.currentBalance)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-[11px] sm:text-xs">Net:</span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        summaryMetrics.periodChange > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : summaryMetrics.periodChange < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatNetChange(summaryMetrics.periodChange)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div />
            )}

            {/* View Mode Toggle: Cards vs Table */}
            <div className="flex items-center self-end sm:self-auto rounded-lg border border-border bg-card p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="size-3" />
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredSnapshots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <CalendarClock className="mx-auto size-10 text-muted-foreground/40" />
              <h4 className="mt-3 text-sm font-semibold text-foreground">
                No daily snapshots found
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {searchDate
                  ? `No snapshots match date search "${searchDate}".`
                  : `No recorded financial activity found for ${activeRange.label.toLowerCase()}.`}
              </p>
              {searchDate ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 text-xs"
                  onClick={() => setSearchDate("")}
                >
                  Clear search
                </Button>
              ) : null}
            </div>
          ) : (
            viewMode === "cards" ? (
              /* Card View: Date → All Account Balances → Total → Net Change */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
                {filteredSnapshots.map((row) => {
                  const isToday = row.date === todayStr;
                  const isYesterday = row.date === yesterdayStr;

                  return (
                    <div
                      key={row.date}
                      className={cn(
                        "rounded-2xl border bg-card overflow-hidden shadow-2xs transition-all duration-200 hover:shadow-xs",
                        isToday
                          ? "border-primary/50 ring-1 ring-primary/20 shadow-xs"
                          : "border-border/80 hover:border-border",
                      )}
                    >
                      {/* Date Header: Clean and distinct without weekday */}
                      <div
                        className={cn(
                          "px-3.5 sm:px-4 py-2 sm:py-2.5 border-b flex items-center justify-between gap-3 transition-colors",
                          isToday
                            ? "bg-primary/[0.08] border-primary/20"
                            : "bg-muted/40 border-border/70",
                        )}
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "flex size-6.5 sm:size-7 items-center justify-center rounded-lg shrink-0",
                              isToday
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "bg-card border border-border/80 text-primary",
                            )}
                          >
                            <Calendar className="size-3.5" />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                            {row.formattedDate}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isToday ? (
                            <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[9px] sm:text-[10px] font-bold shadow-2xs">
                              Today
                            </span>
                          ) : isYesterday ? (
                            <span className="rounded-full bg-muted-foreground/15 text-foreground px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold">
                              Yesterday
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Card Content Body */}
                      <div className="p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
                        {/* Balance of every account that actually existed on this date */}
                        <div
                          className={cn(
                            "text-xs",
                            row.accountBalances.length > 3
                              ? "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2"
                              : "space-y-2",
                          )}
                        >
                          {row.accountBalances.map((item) => (
                            <div
                              key={item.accountId}
                              className="flex items-center justify-between text-muted-foreground py-0.5"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                {(() => {
                                  const Icon = getAccountTypeIcon(item.accountType);
                                  return (
                                    <Icon className="size-3.5 text-muted-foreground shrink-0" />
                                  );
                                })()}
                                <span
                                  className="font-medium text-foreground/90 truncate"
                                  title={item.accountName}
                                >
                                  {item.accountName}:
                                </span>
                              </div>
                              <span className="font-mono font-medium text-foreground tabular-nums shrink-0">
                                {formatCurrency(item.balance)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Total balance & Net change */}
                        <div className="border-t border-border/60 pt-2.5 flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-foreground text-[11px] sm:text-xs">Total:</span>
                            <span className="font-mono font-bold text-foreground tabular-nums text-xs sm:text-sm truncate">
                              {formatCurrency(row.totalBalance)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] sm:text-[11px] text-muted-foreground hidden xs:inline">
                              Net Change:
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold font-mono",
                                row.netChange > 0
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : row.netChange < 0
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    : "text-muted-foreground",
                              )}
                            >
                              {formatNetChange(row.netChange)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View: Columns only show accounts that actually existed in this period */
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm rounded-xl border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-md z-30 rounded-xl">
                      <tr className="border-b border-border rounded-xl  text-xs font-semibold text-muted-foreground">
                        <th className="py-3 px-4 min-w-[150px] sticky left-0 bg-muted/95 backdrop-blur-md z-40 border-r border-border/70 rounded-tl-xl">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <Calendar className="size-3.5 text-primary" />
                            <span>Date</span>
                          </div>
                        </th>
                        {activeAccountsInFilter.map((acc) => {
                          const Icon = getAccountTypeIcon(acc.type);
                          return (
                            <th
                              key={acc.id}
                              className="py-3 px-4 text-right min-w-[140px] max-w-[180px] border-b border-border/80"
                            >
                              <div className="inline-flex items-center justify-end gap-1.5 font-medium truncate w-full">
                                <Icon className="size-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate" title={acc.name}>
                                  {acc.name}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                        <th className="py-3 px-4 text-right min-w-[130px] font-bold text-foreground border-b border-border/80 bg-muted/40">
                          Total
                        </th>
                        <th className="py-3 px-4 text-right min-w-[130px] font-semibold text-foreground border-b border-border/80 rounded-tr-xl">
                          Net Change
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredSnapshots.map((row, rowIndex) => {
                        const isToday = row.date === todayStr;
                        const isYesterday = row.date === yesterdayStr;
                        const isLastRow = rowIndex === filteredSnapshots.length - 1;

                        return (
                          <tr
                            key={row.date}
                            className={cn(
                              "group transition-colors hover:bg-muted/40 text-xs",
                              isToday && "bg-primary/[0.04]",
                            )}
                          >
                            <td
                              className={cn(
                                "py-3 px-4 font-medium text-foreground sticky left-0 bg-card group-hover:bg-muted/40 z-20 border-r border-border/70 border-b border-border/60",
                                isLastRow && "rounded-bl-xl",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                                  <Calendar className="size-3" />
                                </div>
                                <span className="whitespace-nowrap font-medium text-xs text-foreground">
                                  {row.formattedDate}
                                </span>
                                {isToday ? (
                                  <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-bold ml-0.5">
                                    Today
                                  </span>
                                ) : isYesterday ? (
                                  <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[9px] font-medium ml-0.5">
                                    Yesterday
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {activeAccountsInFilter.map((acc) => {
                              const match = row.accountBalances.find(
                                (b) => b.accountId === acc.id,
                              );
                              if (!match) {
                                return (
                                  <td
                                    key={acc.id}
                                    className="py-3.5 px-4 text-right text-muted-foreground/30 font-mono select-none border-b border-border/60"
                                    title="Account did not exist on this date"
                                  >
                                    —
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={acc.id}
                                  className="py-3.5 px-4 text-right font-mono tabular-nums text-foreground/90 border-b border-border/60"
                                >
                                  {formatCurrency(match.balance)}
                                </td>
                              );
                            })}
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground bg-muted/20 border-b border-border/60">
                              {formatCurrency(row.totalBalance)}
                            </td>
                            <td
                              className={cn(
                                "py-3.5 px-4 text-right font-mono tabular-nums border-b border-border/60",
                                isLastRow && "rounded-br-xl",
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  row.netChange > 0
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : row.netChange < 0
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {formatNetChange(row.netChange)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
