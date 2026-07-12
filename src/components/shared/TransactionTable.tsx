"use client";

import { ArrowDownUp, ArrowLeftRight, MoreHorizontal, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { useCategories } from "@/hooks/useCategories";
import {
  getInvestmentTypeLabel,
  isInvestmentTransaction,
} from "@/lib/investments";
import {
  getCategoryIcon,
  getTransactionAmountClass,
  getTransactionTypeMeta,
} from "@/lib/transaction-ui";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types";

type SortKey = "date" | "merchant" | "category" | "amount";

type TransactionTableProps = {
  transactions: Transaction[];
  isLoading?: boolean;
  onSelect?: (transaction: Transaction) => void;
  privateMode?: boolean;
};

export function TransactionTable({
  transactions,
  isLoading,
  onSelect,
  privateMode,
}: TransactionTableProps) {
  const { categories } = useCategories();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const processedTransactions = useMemo(() => {
    return transactions.filter(t => !(t.category === "Settlements" && t.type === "income"));
  }, [transactions]);

  const sorted = useMemo(() => {
    return [...processedTransactions].sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "amount") return (a.amount - b.amount) * multiplier;
      if (sortKey === "date") {
        return (
          (new Date(a.date).getTime() - new Date(b.date).getTime()) * multiplier
        );
      }
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) *
        multiplier;
    });
  }, [processedTransactions, sortDirection, sortKey]);

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  }

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ReceiptText className="size-5" />
        </span>
        <p className="mt-3 font-medium">No transactions found</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Add a transaction or adjust filters to populate this view.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg">
      <div className="max-h-[560px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/50 dark:bg-white/[0.03]">
            <TableRow>
              {[
                ["date", "Date + Time"],
                ["merchant", "Merchant"],
                ["category", "Category"],
                ["amount", "Amount"],
              ].map(([key, label]) => (
                <TableHead key={key}>
                  <Button
                    className="px-0"
                    variant="ghost"
                    onClick={() => changeSort(key as SortKey)}
                  >
                    {label}
                    <ArrowDownUp className="size-3.5" />
                  </Button>
                </TableHead>
              ))}
              <TableHead>Account</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-10">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((transaction) => {
              const category = categories.find(
                (item) => item.name === transaction.category,
              );
              const isInvestment = isInvestmentTransaction(transaction);
              const isTransfer = transaction.category === "Settlements";
              const fromAcc = transaction.account;
              const toAcc = isTransfer ? transaction.merchant.replace("Transfer to ", "") : "";
              const displayMerchant = isTransfer ? `Transfer: ${fromAcc} → ${toAcc}` : transaction.merchant;
              const displayCategory = isTransfer ? "Transfer" : transaction.category;
              const displayAccount = isTransfer ? `${fromAcc} → ${toAcc}` : transaction.account;

              const typeMeta = getTransactionTypeMeta(transaction.type);
              const TypeIcon = isTransfer ? ArrowLeftRight : typeMeta.icon;
              const iconClass = isTransfer ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : typeMeta.accent.icon;
              const CategoryIcon = getCategoryIcon(transaction.category);

              return (
                <TableRow
                  key={transaction.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onSelect?.(transaction)}
                >
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span
                          className={cn(
                            "flex size-7 items-center justify-center rounded-lg",
                            iconClass,
                          )}
                        >
                          <TypeIcon className="size-3.5" />
                        </span>
                        {formatDateTime(transaction.date)}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {displayMerchant}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span
                          className="flex size-7 items-center justify-center rounded-lg bg-muted"
                          style={{ color: category?.color ?? "#64748b" }}
                        >
                          <CategoryIcon className="size-3.5" />
                        </span>
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category?.color ?? "#64748b" }}
                        />
                        {displayCategory}
                        {isInvestment ? (
                          <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                            Investment
                            {transaction.investmentType
                              ? ` · ${getInvestmentTypeLabel(transaction.investmentType)}`
                              : ""}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold",
                        isTransfer
                          ? "text-indigo-600 dark:text-indigo-400"
                          : isInvestment
                            ? "text-indigo-600 dark:text-indigo-400"
                            : getTransactionAmountClass(transaction.type),
                      )}
                    >
                      {isTransfer ? "" : (transaction.type === "income" ? "+" : "-")}
                      {formatCurrency(transaction.amount, privateMode)}
                    </TableCell>
                    <TableCell>{displayAccount}</TableCell>
                    <TableCell>{transaction.purpose}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{transaction.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label="Open actions"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onSelect?.(transaction)}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
