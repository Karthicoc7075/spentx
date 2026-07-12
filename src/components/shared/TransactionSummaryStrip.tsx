"use client";

import { ArrowDownCircle, ArrowUpCircle, Banknote, Sigma, Activity } from "lucide-react";
import { summarizeTransactions } from "@/lib/transaction-summary";
import { cn, formatCurrency } from "@/lib/utils";
import type { GlobalFilters, Transaction } from "@/types";

type TransactionSummaryStripProps = {
  transactions: Transaction[];
  filters: Pick<GlobalFilters, "dateFrom" | "dateTo">;
  className?: string;
  privateMode?: boolean;
};

export function TransactionSummaryStrip({
  transactions,
  filters,
  className,
  privateMode,
}: TransactionSummaryStripProps) {
  const summary = summarizeTransactions(transactions, filters);
  const netPrefix = summary.net > 0 ? "+" : summary.net < 0 ? "" : "";

  const items = [
    {
      label: "Total Income",
      value: formatCurrency(summary.totalIncome, privateMode),
      tone: "text-emerald-600 dark:text-emerald-400",
      icon: ArrowUpCircle,
      iconRing: "ring-emerald-500/20 text-emerald-600",
    },
    {
      label: "Total Expense",
      value: formatCurrency(summary.totalExpense, privateMode),
      tone: "text-rose-600 dark:text-rose-400",
      icon: ArrowDownCircle,
      iconRing: "ring-rose-500/20 text-rose-600",
    },
    {
      label: "Net",
      value: `${netPrefix}${formatCurrency(summary.net, privateMode)}`,
      tone:
        summary.net >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400",
      icon: Sigma,
      iconRing:
        summary.net >= 0
          ? "ring-emerald-500/20 text-emerald-600"
          : "ring-rose-500/20 text-rose-600",
    },
    {
      label: "Count",
      value: String(summary.transactionCount),
      tone: "text-foreground",
      icon: Activity,
      iconRing: "ring-border/50 text-muted-foreground",
    },
    {
      label: "Avg / Day",
      value: formatCurrency(summary.averageDailySpend, privateMode),
      tone: "text-foreground",
      icon: Banknote,
      iconRing: "ring-border/50 text-muted-foreground",
    },
  ];

  return (
    <div
      className={cn(
        "group relative grid gap-4 overflow-hidden rounded-[20px] border border-border/50 bg-card/40 p-5 shadow-sm transition-all duration-300 hover:border-border/80 hover:bg-card/60 hover:shadow-md sm:grid-cols-2 lg:grid-cols-5",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col justify-between rounded-2xl bg-background/30 p-4 ring-1 ring-border/40 transition-colors hover:bg-background/50">
          <div className="flex items-center gap-2">
            <div className={cn("flex size-6 items-center justify-center rounded-full ring-1", item.iconRing)}>
              <item.icon className="size-3" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
          </div>
          <p className={cn("mt-4 font-mono text-2xl font-bold tracking-tight", item.tone)}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}