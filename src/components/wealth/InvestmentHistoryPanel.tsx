"use client";

import { TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
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
  compareTransactionsNewestFirst,
  formatCurrency,
  formatDateTime,
  transactionDateKey,
} from "@/lib/utils";
import type { Transaction } from "@/types";

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

    // Full detail list — no artificial cap (matches mobile Wealth detail list).
    return [...rows].sort(compareTransactionsNewestFirst);
  }, [categories, transactions]);

  const total = useMemo(
    () =>
      history.reduce((sum, transaction) => {
        const amount = transaction.totalAmount ?? transaction.amount ?? 0;
        return transaction.type === "expense" ? sum + amount : sum + amount;
      }, 0),
    [history],
  );

  return (
    <div className="sx-surface">
      <div className="flex flex-row items-start justify-between gap-3 border-b px-6 py-4">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <TrendingUp className="size-4 text-primary" />
            Investment history
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Full detail list — investment category spends and investment-like
            credits (parity with mobile Wealth).
          </p>
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {history.length} · {formatCurrency(total)}
        </Badge>
      </div>

      {history.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          No investment history yet. Tag expenses with the{" "}
          <span className="font-medium text-foreground">Investment</span>{" "}
          category (or merchants like Groww / Zerodha) to see them here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="max-h-[28rem] overflow-auto">
            <Table>
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
                {history.map((transaction) => {
                  const amount =
                    transaction.totalAmount ?? transaction.amount ?? 0;
                  const isExpense = transaction.type === "expense";
                  return (
                    <TableRow key={transaction.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
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
      )}
    </div>
  );
}
