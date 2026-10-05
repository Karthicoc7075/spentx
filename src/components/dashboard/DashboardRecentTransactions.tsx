"use client";

import Link from "next/link";
import { ArrowRight, Compass, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/hooks/useCategories";
import { isInvestmentTransaction } from "@/lib/investments";
import { getPurposeById, resolvePurposeId } from "@/lib/purposes";
import { getCategoryIcon, getTransactionDisplayTitle } from "@/lib/transaction-ui";
import { cn, formatCurrency, transactionDateKey } from "@/lib/utils";
import type { Purpose, Transaction } from "@/types";

type DashboardRecentTransactionsProps = {
  transactions: Transaction[];
  purposes: Purpose[];
  isLoading?: boolean;
  isReadOnly?: boolean;
  onAddTransaction?: () => void;
};

export function DashboardRecentTransactions({
  transactions,
  purposes,
  isLoading,
  isReadOnly,
  onAddTransaction,
}: DashboardRecentTransactionsProps) {
  const { categories } = useCategories();
  return (
    <div className="flex flex-col sx-surface">
      <div className="flex items-center justify-between gap-3 p-5 pb-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Recent Transactions
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Latest {transactions.length || 10} in this period
          </p>
        </div>
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-[0.5rem] border border-border/80 bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted shadow-xs"
          href="/transactions"
        >
          See All
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid gap-2.5 p-5 pt-0">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] rounded-xl" />
          ))
        ) : transactions.filter((tx) => tx.isActive !== false && !tx.deletedAt && tx.status !== "deleted").length > 0 ? (
          transactions
            .filter((tx) => tx.isActive !== false && !tx.deletedAt && tx.status !== "deleted")
            .map((tx) => {
            const purposeId = resolvePurposeId(tx.purpose, purposes);
            const purpose = getPurposeById(purposes, purposeId);
            const isIncome = tx.type === "income";
            const isInvestment = isInvestmentTransaction(tx, categories);

            const isOuting = Boolean(tx.outingId);
            const displayTitle = getTransactionDisplayTitle(tx);
            const CategoryIcon = isOuting ? Compass : getCategoryIcon(tx.category);
            const content = (
              <div
                key={tx.id}
                className={cn(
                  "flex items-center gap-3.5 rounded-xl bg-muted/40 p-3.5 transition-colors hover:bg-muted/70",
                  isOuting && !isReadOnly && "cursor-pointer hover:border-primary/40 border border-transparent",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-card text-xs font-semibold tracking-wide",
                    isOuting
                      ? "text-primary"
                      : isIncome
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isInvestment
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-foreground",
                  )}
                >
                  <CategoryIcon className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {displayTitle.primary}
                    </p>
                    {displayTitle.itemsLabel ? (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {displayTitle.itemsLabel}
                      </span>
                    ) : null}
                    {tx.status === "unverified" ? (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                        Unverified
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isOuting
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : isIncome
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : isInvestment
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                              : "bg-muted text-muted-foreground border border-border/50",
                      )}
                    >
                      {tx.category}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {new Date(transactionDateKey(tx)).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor: purpose?.color ?? "#8b7ff0",
                        }}
                      />
                      {tx.accountName || (purpose?.name ?? tx.purpose)}
                    </span>
                  </div>
                </div>

                <div
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    isIncome
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {isIncome ? "+" : "−"}
                  {formatCurrency(tx.amount)}
                </div>
              </div>
            );

            if (isOuting && tx.outingId && !isReadOnly) {
              return (
                <Link key={tx.id} href={`/outings/${tx.outingId}`}>
                  {content}
                </Link>
              );
            }

            return content;
          })
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl bg-muted/40 px-5 py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Receipt className="size-5" strokeWidth={2} />
            </div>
            <p className="text-sm font-semibold">No transactions yet</p>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Add an expense or income to start building your money timeline.
            </p>
            {!isReadOnly && onAddTransaction ? (
              <Button className="mt-5" onClick={onAddTransaction}>
                <Plus className="size-4" />
                Add transaction
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
