"use client";

import Link from "next/link";
import { ArrowRight, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/hooks/useCategories";
import { isInvestmentTransaction } from "@/lib/investments";
import { getPurposeById, resolvePurposeId } from "@/lib/purposes";
import { getTransactionDisplayTitle } from "@/lib/transaction-ui";
import { cn, formatCurrency, transactionDateKey } from "@/lib/utils";
import type { Purpose, Transaction } from "@/types";

type DashboardRecentTransactionsProps = {
  transactions: Transaction[];
  purposes: Purpose[];
  isLoading?: boolean;
  isReadOnly?: boolean;
  onAddTransaction?: () => void;
};

function merchantInitials(merchant: string) {
  const parts = merchant.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
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
        ) : transactions.length > 0 ? (
          transactions.map((tx) => {
            const purposeId = resolvePurposeId(tx.purpose, purposes);
            const purpose = getPurposeById(purposes, purposeId);
            const isIncome = tx.type === "income";
            const isInvestment = isInvestmentTransaction(tx, categories);

            const isOuting = Boolean(tx.outingId);
            const displayTitle = getTransactionDisplayTitle(tx);
            const content = (
              <div
                key={tx.id}
                className={cn(
                  "flex items-center gap-3.5 rounded-xl bg-muted/50 p-3.5 transition-colors hover:bg-muted",
                  isOuting && "cursor-pointer hover:border-primary/40 border border-transparent",
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold tracking-wide text-foreground">
                  {isOuting ? "🏕️" : merchantInitials(tx.merchant)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isOuting
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400"
                          : isIncome
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : isInvestment
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                              : "bg-accent text-accent-foreground",
                      )}
                    >
                      {tx.category}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight">
                    <span className="truncate">{displayTitle.primary}</span>
                    {displayTitle.itemsLabel ? (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {displayTitle.itemsLabel}
                      </span>
                    ) : null}
                  </p>
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

            if (isOuting && tx.outingId) {
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
