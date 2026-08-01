"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Sigma,
  Activity,
  Users,
} from "lucide-react";
import { summarizeTransactions } from "@/lib/transaction-summary";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  Account,
  Category,
  GlobalFilters,
  OutingExpense,
  Transaction,
} from "@/types";

type TransactionSummaryStripProps = {
  /** Display-list rows (for Count). */
  transactions: Transaction[];
  filters: Pick<GlobalFilters, "dateFrom" | "dateTo">;
  className?: string;
  privateMode?: boolean;
  accounts?: Account[];
  /**
   * Full ledger for the same filters — required so Income/Expense match
   * Dashboard (outing rollups are not double-counted).
   */
  ledgerTransactions?: Transaction[];
  outingExpenses?: OutingExpense[];
  categories?: Category[];
  carryForward?: number;
};

export function TransactionSummaryStrip({
  transactions,
  filters,
  className,
  privateMode,
  accounts = [],
  ledgerTransactions,
  outingExpenses,
  categories,
  carryForward = 0,
}: TransactionSummaryStripProps) {
  const summary = summarizeTransactions(transactions, filters, accounts, {
    ledgerTransactions,
    outingExpenses,
    categories,
    periodIncomeOnly: true,
  });
  const netPrefix = summary.net > 0 ? "+" : summary.net < 0 ? "" : "";

  // Green when positive, red when negative, neutral when exactly zero — which
  // also covers "no previous month data" (nothing before the selected period
  // nets to 0, same as a coincidental zero balance), per spec: always show
  // ₹0, never a false "surplus"/"deficit" label.
  const isCarryPositive = carryForward > 0;
  const isCarryNegative = carryForward < 0;
  const carryPrefix = isCarryPositive ? "+" : "";

  const rawTxs = ledgerTransactions ?? transactions;
  const totalReturns = rawTxs.reduce((sum, tx) => {
    if (tx.type === "expense") return sum;
    const cat = (tx.category ?? "").trim().toLowerCase();
    if (cat === "friend returns") {
      return sum + Number(tx.totalAmount ?? tx.amount ?? 0);
    }
    return sum;
  }, 0);

  const items: Array<{
    label: string;
    value: string;
    tone: string;
    icon: typeof ArrowUpCircle;
    iconRing: string;
    hint?: string;
  }> = [
    {
      label: "Total Income",
      value: formatCurrency(summary.totalIncome, privateMode),
      tone: "text-emerald-600 dark:text-emerald-400",
      icon: ArrowUpCircle,
      iconRing: "ring-emerald-500/20 text-emerald-600",
      hint:
        summary.openingBalanceIncome > 0
          ? `opening ${formatCurrency(summary.openingBalanceIncome, privateMode)} in Net Worth`
          : undefined,
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
      label: "Prev Month",
      value: `${carryPrefix}${formatCurrency(carryForward, privateMode)}`,
      tone: isCarryPositive
        ? "text-emerald-600 dark:text-emerald-400"
        : isCarryNegative
          ? "text-rose-600 dark:text-rose-400"
          : "text-muted-foreground",
      icon: isCarryPositive ? ArrowUpRight : isCarryNegative ? ArrowDownRight : Minus,
      iconRing: isCarryPositive
        ? "ring-emerald-500/20 text-emerald-600"
        : isCarryNegative
          ? "ring-rose-500/20 text-rose-600"
          : "ring-border/50 text-muted-foreground",
      hint: isCarryPositive
        ? "surplus carried"
        : isCarryNegative
          ? "deficit carried"
          : undefined,
    },
  ];

  // Already counted in Total Income above — called out separately so it's
  // clear where the gap between Income/Expense and Net Worth movement comes
  // from (a friend paying you back isn't newly-earned money).
  if (totalReturns > 0) {
    items.push({
      label: "Friend Returns",
      value: `+${formatCurrency(totalReturns, privateMode)}`,
      tone: "text-emerald-600 dark:text-emerald-400",
      icon: Users,
      iconRing: "ring-emerald-500/20 text-emerald-600",
    });
  }

  return (
    <div
      className={cn(
        "sx-surface group relative grid gap-4 overflow-hidden p-5 sm:grid-cols-2 lg:grid-cols-5",
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
          {item.hint ? (
            <p className="mt-1 text-[10px] font-medium text-muted-foreground">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}