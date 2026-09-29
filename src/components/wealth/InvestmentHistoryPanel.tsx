"use client";

import { TrendingUp, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCategories } from "@/hooks/useCategories";
import { isInvestmentTransaction } from "@/lib/investments";
import {
  cn,
  compareTransactionsNewestFirst,
  formatCurrency,
  formatDateTime,
  transactionDateKey,
} from "@/lib/utils";
import type { Transaction } from "@/types";

const PAGE_SIZE = 20;

type InvestmentHistoryPanelProps = {
  transactions: Transaction[];
};

/**
 * Mobile parity: Wealth → investment history list (expenses in investment
 * categories + income that looks like investment credits).
 */
export function InvestmentHistoryPanel({
  transactions,
}: InvestmentHistoryPanelProps) {
  const { categories } = useCategories();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const history = useMemo(() => {
    const investmentKeywords = [
      "groww",
      "zerodha",
      "upstox",
      "sip",
      "mutual",
      "stocks",
      "nse",
      "bse",
      "kuvera",
      "etmoney",
      "investment",
      "fd",
      "fixed deposit",
      "dividend",
      "interest",
    ];

    const rows = transactions.filter((transaction) => {
      if (isInvestmentTransaction(transaction, categories)) return true;
      const haystack =
        `${transaction.merchant} ${transaction.note ?? ""} ${transaction.category}`.toLowerCase();
      return investmentKeywords.some((keyword) => haystack.includes(keyword));
    });

    return [...rows].sort(compareTransactionsNewestFirst);
  }, [categories, transactions]);

  const visibleHistory = useMemo(
    () => history.slice(0, visibleCount),
    [history, visibleCount],
  );

  const total = useMemo(
    () =>
      history.reduce((sum, transaction) => {
        const amount = transaction.totalAmount ?? transaction.amount ?? 0;
        return transaction.type === "expense" ? sum + amount : sum + amount;
      }, 0),
    [history],
  );

  return (
    <div className="sx-surface overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 border-b px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-foreground">
            <TrendingUp className="size-4 text-primary shrink-0" />
            Investment history
          </h3>
          <p className="mt-0.5 sm:mt-1 text-xs text-muted-foreground">
            Full detail list — investment category spends and investment-like
            credits (parity with mobile Wealth).
          </p>
        </div>
        <Badge variant="secondary" className="tabular-nums text-[11px] sm:text-xs shrink-0 self-start sm:self-auto">
          {history.length} · {formatCurrency(total)}
        </Badge>
      </div>

      {history.length === 0 ? (
        <div className="px-4 py-8 sm:px-6 sm:py-10 text-center text-xs sm:text-sm text-muted-foreground">
          No investment history yet. Tag expenses with the{" "}
          <span className="font-medium text-foreground">Investment</span>{" "}
          category (or merchants like Groww / Zerodha) to see them here.
        </div>
      ) : (
        <div>
          {/* Mobile Card List (< sm) */}
          <div className="divide-y divide-border/60 block sm:hidden">
            {visibleHistory.map((transaction) => {
              const amount =
                transaction.totalAmount ?? transaction.amount ?? 0;
              const isExpense = transaction.type === "expense";
              const dateKey = transactionDateKey(transaction);

              return (
                <div
                  key={transaction.id}
                  className="p-3.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="flex size-8.5 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0 text-xs">
                      <TrendingUp className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {transaction.merchant}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {new Date(dateKey).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-[110px]">
                          {transaction.account || "—"}
                        </span>
                        {transaction.category ? (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[100px]">
                              {transaction.category}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "text-xs font-bold font-mono tabular-nums",
                        isExpense
                          ? "text-foreground"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {isExpense ? "−" : "+"}
                      {formatCurrency(amount)}
                    </p>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {transaction.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= sm) */}
          <div className="hidden sm:block">
            <div className="max-h-[28rem] overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleHistory.map((transaction) => {
                    const amount =
                      transaction.totalAmount ?? transaction.amount ?? 0;
                    const isExpense = transaction.type === "expense";
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                          {formatDateTime(transactionDateKey(transaction))}
                        </TableCell>
                        <TableCell className="font-medium">
                          {transaction.merchant}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{transaction.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {transaction.account || "—"}
                        </TableCell>
                        <TableCell className="capitalize text-xs text-muted-foreground">
                          {transaction.type}
                        </TableCell>
                        <TableCell
                          className={
                            isExpense
                              ? "text-right font-semibold tabular-nums"
                              : "text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                          }
                        >
                          {isExpense ? "−" : "+"}
                          {formatCurrency(amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination Controls */}
          {history.length > visibleCount ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-6 sm:py-3.5 bg-muted/15">
              <span className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {visibleHistory.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {history.length}
                </span>{" "}
                investments
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="h-8 px-4 text-xs font-semibold gap-1.5 rounded-lg hover:bg-primary/5 hover:text-primary transition-all cursor-pointer w-full sm:w-auto"
              >
                <ChevronDown className="size-3.5" />
                Load more
                <span className="text-[10px] text-muted-foreground font-normal">
                  (+{Math.min(PAGE_SIZE, history.length - visibleCount)})
                </span>
              </Button>
            </div>
          ) : history.length > PAGE_SIZE ? (
            <div className="text-center border-t border-border/60 py-2.5 text-xs text-muted-foreground bg-muted/5">
              All {history.length} investments loaded
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
