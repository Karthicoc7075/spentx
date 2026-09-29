"use client";

import { X, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  filterWealthTransactions,
  getTransactionBalanceAfter,
  getWealthFilterLabel,
} from "@/lib/wealth";
import {
  compareTransactionsNewestFirst,
  formatCurrency,
  formatDateTime,
  transactionDateKey,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Account, Transaction, WealthFilter } from "@/types";

const PAGE_SIZE = 20;

type WealthFilteredTransactionsProps = {
  transactions: Transaction[];
  accounts: Account[];
  filter: WealthFilter;
  onClearFilter?: () => void;
};

export function WealthFilteredTransactions({
  transactions,
  accounts,
  filter,
  onClearFilter,
}: WealthFilteredTransactionsProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination whenever the filter or active account changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const filtered = useMemo(
    () => filterWealthTransactions(transactions, filter, accounts),
    [accounts, filter, transactions],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort(compareTransactionsNewestFirst),
    [filtered],
  );

  const visibleTransactions = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  );

  const balanceAccountName =
    filter.type === "account" ? filter.accountName : null;

  const balanceMap = useMemo(() => {
    if (!balanceAccountName) return new Map<string, number>();
    return getTransactionBalanceAfter(
      transactions,
      balanceAccountName,
      accounts,
    );
  }, [accounts, balanceAccountName, transactions]);

  const filterLabel = getWealthFilterLabel(filter);
  const isFiltered = filter.type !== "all";

  return (
    <div className="sx-surface overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-foreground">
            {isFiltered ? "Filtered transactions" : "All account activity"}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isFiltered
              ? `Recent ledger transactions for ${filterLabel}.`
              : "Full detail list of ledger activity."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Badge
            className="text-[11px] sm:text-xs max-w-full truncate font-medium"
            variant="success"
          >
            {sorted.length > PAGE_SIZE
              ? `${visibleTransactions.length} of ${sorted.length} · ${filterLabel}`
              : `${sorted.length} · ${filterLabel}`}
          </Badge>
          {isFiltered && onClearFilter ? (
            <Button variant="ghost" size="sm" className="h-7.5 px-2 text-xs" onClick={onClearFilter}>
              <X className="mr-1 size-3.5" />
              Clear filter
            </Button>
          ) : null}
        </div>
      </div>
      <div className="p-0">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs sm:text-sm text-muted-foreground">
            No transactions found for this selection.
          </p>
        ) : (
          <div>
            {/* Mobile Card List (< sm) */}
            <div className="divide-y divide-border/60 block sm:hidden">
              {visibleTransactions.map((transaction) => {
                const isIncome = transaction.type === "income";
                const balanceAfter = balanceAccountName
                  ? balanceMap.get(transaction.id)
                  : undefined;
                const dateKey = transactionDateKey(transaction);

                return (
                  <div
                    key={transaction.id}
                    className="p-3.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex size-8.5 items-center justify-center rounded-xl shrink-0 text-[11px] font-bold tracking-wider",
                          isIncome
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {transaction.merchant?.slice(0, 2).toUpperCase() || "??"}
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
                            {transaction.account}
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
                          isIncome
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {isIncome ? "+" : "−"}
                        {formatCurrency(transaction.amount)}
                      </p>
                      {balanceAfter !== undefined ? (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 tabular-nums">
                          Bal: {formatCurrency(balanceAfter)}
                        </p>
                      ) : (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {transaction.type}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= sm) */}
            <div className="hidden sm:block">
              <div className="max-h-[32rem] overflow-x-auto">
                <Table className="min-w-[620px]">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      {balanceAccountName ? (
                        <TableHead className="text-right">Balance After</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(transactionDateKey(transaction))}
                        </TableCell>
                        <TableCell className="font-medium">
                          {transaction.merchant}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {transaction.category || "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-semibold tabular-nums",
                            transaction.type === "income"
                              ? "text-emerald-500"
                              : "text-rose-500",
                          )}
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell className="capitalize text-xs">
                          {transaction.type}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {transaction.account}
                        </TableCell>
                        {balanceAccountName ? (
                          <TableCell className="text-right text-xs font-medium tabular-nums">
                            {formatCurrency(
                              balanceMap.get(transaction.id) ?? 0,
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination Controls */}
            {sorted.length > visibleCount ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-6 sm:py-3.5 bg-muted/15">
                <span className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-semibold text-foreground">
                    {visibleTransactions.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-foreground">
                    {sorted.length}
                  </span>{" "}
                  transactions
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
                    (+{Math.min(PAGE_SIZE, sorted.length - visibleCount)})
                  </span>
                </Button>
              </div>
            ) : sorted.length > PAGE_SIZE ? (
              <div className="text-center border-t border-border/60 py-2.5 text-xs text-muted-foreground bg-muted/5">
                All {sorted.length} transactions loaded
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}