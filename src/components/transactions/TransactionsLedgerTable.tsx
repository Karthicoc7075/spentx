"use client";

import { ReceiptText } from "lucide-react";
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
import { usePurposes } from "@/hooks/usePurposes";
import { getPurposeById, resolvePurposeId } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import type { Transaction } from "@/types";

type TransactionsLedgerTableProps = {
  transactions: Transaction[];
  isLoading?: boolean;
  privateMode?: boolean;
  onSelect?: (transaction: Transaction) => void;
  onClearFilters?: () => void;
};

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
  onSelect,
  onClearFilters,
}: TransactionsLedgerTableProps) {
  const { purposes } = usePurposes();

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
    <div className="flex flex-col overflow-x-auto overflow-y-hidden rounded-2xl border border-border bg-card">
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

            return (
              <TableRow
                key={transaction.id}
                className="cursor-pointer border-border/60 hover:bg-muted/40"
                onClick={() => onSelect?.(transaction)}
              >
                <TableCell className="whitespace-nowrap px-4 text-muted-foreground">
                  {formatLedgerDate(transaction.date)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3 whitespace-nowrap py-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-bold tracking-wide text-foreground">
                      {merchantInitials(transaction.merchant)}
                    </div>
                    <span className="font-semibold tracking-tight">{transaction.merchant}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                      isIncome
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-accent text-accent-foreground",
                    )}
                  >
                    {transaction.category}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span
                      className="size-2 rounded-full ring-2 ring-background shadow-sm"
                      style={{ backgroundColor: purpose?.color ?? "#8b7ff0" }}
                    />
                    {purpose?.name ?? transaction.purpose}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {transaction.account}
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
                    {formatCurrency(transaction.amount, privateMode)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}