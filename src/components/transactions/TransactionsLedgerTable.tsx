"use client";

import { MapPin, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { usePurposes } from "@/hooks/usePurposes";
import { isOutingRollupTransaction } from "@/lib/outings";
import {
  getPurposeById,
  getPurposeDisplayName,
  resolvePurposeId,
} from "@/lib/purposes";
import { getTransactionDisplayTitle } from "@/lib/transaction-ui";
import {
  cn,
  formatCurrency,
  summariseNames,
  transactionCategoryNames,
  transactionDateKey,
  transactionPurposeIds,
} from "@/lib/utils";
import type { Transaction } from "@/types";

type TransactionsLedgerTableProps = {
  transactions: Transaction[];
  isLoading?: boolean;
  privateMode?: boolean;
  /** transactionId → sum of matching splits, when a Purpose/Category filter
   * is active. Falls back to the transaction's total when absent. */
  displayAmounts?: Map<string, number>;
  /** Human-readable active Purpose/Category filter values, e.g.
   * ["Family", "Grocery"] — shown as "Matched: …" on partially matched rows. */
  matchedLabels?: string[];
  onSelect?: (transaction: Transaction) => void;
  onClearFilters?: () => void;
};

type TransactionBadge = {
  label: "Split Expense" | "Friend Split" | "Outing";
  className: string;
};

const badgePurple =
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400";
const badgeGreen =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";

/**
 * Badge for the special transaction types only. Normal transactions are the
 * default and deliberately get no badge, so the list stays scannable.
 */
function getTransactionBadge(
  transaction: Transaction,
  friendSplitTransactionIds: Set<string>,
): TransactionBadge | null {
  // A friend split is standalone — it never carries an outingId.
  if (friendSplitTransactionIds.has(transaction.id)) {
    return { label: "Friend Split", className: badgeGreen };
  }
  if (transaction.outingId) {
    return { label: "Outing", className: badgePurple };
  }
  if (transaction.hasSplits && (transaction.splits?.length ?? 0) > 1) {
    return { label: "Split Expense", className: badgePurple };
  }
  return null;
}

function formatLedgerDate(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function merchantInitials(merchant: string) {
  const parts = merchant.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function TransactionsLedgerTable({
  transactions,
  isLoading,
  privateMode,
  displayAmounts,
  matchedLabels = [],
  onSelect,
  onClearFilters,
}: TransactionsLedgerTableProps) {
  const { purposes } = usePurposes();
  const { splits: friendSplits } = useFriendSplits();
  const friendSplitTransactionIds = new Set(
    friendSplits.map((split) => split.transactionId),
  );

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ReceiptText className="size-5" />
        </span>
        <p className="mt-3 font-medium">No transactions match your filters.</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Try adjusting the date range or clearing filters.
        </p>
        {onClearFilters ? (
          <Button className="mt-4" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sx-surface flex flex-col overflow-x-auto overflow-y-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="h-11 px-4 text-xs font-medium text-muted-foreground">Date</TableHead>
            <TableHead className="h-11 text-xs font-medium text-muted-foreground">Merchant</TableHead>
            <TableHead className="h-11 text-xs font-medium text-muted-foreground">Category</TableHead>
            <TableHead className="h-11 text-xs font-medium text-muted-foreground">Purpose</TableHead>
            <TableHead className="h-11 text-xs font-medium text-muted-foreground">Account</TableHead>
            <TableHead className="h-11 pr-4 text-right text-xs font-medium text-muted-foreground">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => {
            const purposeId = resolvePurposeId(transaction.purpose, purposes);
            const purpose = getPurposeById(purposes, purposeId);
            const isIncome = transaction.type === "income";
            const isOutingRollup = isOutingRollupTransaction(transaction);
            const isCash =
              (transaction.paymentMethod || transaction.paymentType || "")
                .toLowerCase() === "cash" ||
              (transaction.accountName || transaction.account || "")
                .toLowerCase() === "cash" ||
              (transaction.tags ?? []).includes("cash");
            const total = transaction.totalAmount ?? transaction.amount ?? 0;
            const amount = displayAmounts?.get(transaction.id) ?? total;
            // Only a partial match is worth spelling out — a fully matching
            // row would just read "₹703 of ₹703".
            const isPartialMatch = Math.abs(amount - total) >= 0.01;
            const accountLabel =
              transaction.accountName || transaction.account || "—";
            const badge = getTransactionBadge(transaction, friendSplitTransactionIds);
            const displayTitle = getTransactionDisplayTitle(transaction);
            const categoryNames = transactionCategoryNames(transaction);
            const categorySummary = summariseNames(categoryNames);
            const purposeIds = transactionPurposeIds(transaction);
            const purposeNames = purposeIds.map((id) =>
              getPurposeDisplayName(id, purposes),
            );
            const purposeSummary = summariseNames(purposeNames);

            return (
              <TableRow
                key={transaction.id}
                className="cursor-pointer border-border/60 hover:bg-muted/40"
                onClick={() => onSelect?.(transaction)}
              >
                <TableCell className="whitespace-nowrap px-4 text-muted-foreground">
                  {formatLedgerDate(transactionDateKey(transaction))}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3 whitespace-nowrap py-1">
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-bold tracking-wide text-foreground",
                        isOutingRollup &&
                          "border-primary/30 bg-primary/10 text-primary",
                      )}
                    >
                      {isOutingRollup ? (
                        <MapPin className="size-4" />
                      ) : (
                        merchantInitials(transaction.merchant)
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="block font-semibold tracking-tight">
                        {displayTitle.primary}
                      </span>
                      {/* Normal transactions are the default and get no badge. */}
                      {badge || displayTitle.itemsLabel ? (
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          {badge ? (
                            <span
                              className={cn(
                                "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          ) : null}
                          {displayTitle.itemsLabel ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {displayTitle.itemsLabel}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {isPartialMatch && matchedLabels.length > 0 ? (
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                          Matched: {matchedLabels.join(" · ")}
                        </p>
                      ) : null}
                      {isOutingRollup ? (
                        <p className="text-[11px] font-medium text-primary">
                          Outing total · tap to open
                        </p>
                      ) : isCash ? (
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Cash
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {/* Split Expense shows every split category, not just the first. */}
                  <span className="flex flex-wrap items-center gap-1">
                    {categorySummary.shown.map((name) => (
                      <span
                        key={name}
                        className={cn(
                          "inline-flex whitespace-nowrap items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                          isIncome
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-accent text-accent-foreground",
                        )}
                      >
                        {name}
                      </span>
                    ))}
                    {categorySummary.overflow > 0 ? (
                      <span
                        className="whitespace-nowrap text-xs font-semibold text-muted-foreground"
                        title={categoryNames.join(", ")}
                      >
                        +{categorySummary.overflow}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {/* Split Expense shows every split purpose. */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {purposeSummary.shown.map((name, index) => (
                      <span key={name} className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full ring-2 ring-background shadow-sm"
                          style={{
                            backgroundColor:
                              (index === 0
                                ? purpose?.color
                                : getPurposeById(purposes, purposeIds[index])?.color) ??
                              "#8b7ff0",
                          }}
                        />
                        {name}
                      </span>
                    ))}
                    {purposeSummary.overflow > 0 ? (
                      <span
                        className="text-xs font-semibold text-muted-foreground"
                        title={purposeNames.join(", ")}
                      >
                        +{purposeSummary.overflow}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {accountLabel}
                  {isCash && accountLabel.toLowerCase() !== "cash" ? (
                    <span className="ml-1 text-[10px] font-semibold uppercase text-muted-foreground/80">
                      · Cash
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right">
                  <span
                    className={cn(
                      "inline-flex shrink-0 text-sm font-bold tabular-nums",
                      isIncome
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {isIncome ? "+" : "−"}
                    {formatCurrency(amount, privateMode)}
                  </span>
                  {isPartialMatch ? (
                    <span className="block text-[11px] font-medium text-muted-foreground tabular-nums">
                      of {formatCurrency(total, privateMode)}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}