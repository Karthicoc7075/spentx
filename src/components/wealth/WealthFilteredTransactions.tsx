"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
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
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Account, Investment, Transaction, WealthFilter } from "@/types";

type WealthFilteredTransactionsProps = {
  transactions: Transaction[];
  accounts: Account[];
  investments: Investment[];
  filter: WealthFilter;
  onClearFilter: () => void;
};

export function WealthFilteredTransactions({
  transactions,
  accounts,
  investments,
  filter,
  onClearFilter,
}: WealthFilteredTransactionsProps) {
  const filtered = useMemo(
    () => filterWealthTransactions(transactions, filter, accounts, investments),
    [accounts, filter, investments, transactions],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [filtered],
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

  if (filter.type === "all") return null;

  const filterLabel = getWealthFilterLabel(filter, accounts);

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-row items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Transactions</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Filtered by selected segment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
            Showing: {filterLabel}
          </Badge>
          <Button variant="ghost" onClick={onClearFilter}>
            <X className="mr-1 size-3.5" />
            Clear filter
          </Button>
        </div>
      </div>
      <div className="p-0">
        {sorted.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No transactions found for this selection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  {balanceAccountName ? (
                    <TableHead className="text-right">Balance After</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(transaction.date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {transaction.merchant}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold",
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
                      <TableCell className="text-right text-xs font-medium">
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
        )}
      </div>
    </div>
  );
}