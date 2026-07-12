import { getDaysInRange } from "@/lib/date-filters";
import { sumSpendingExpenses } from "@/lib/investments";
import type { GlobalFilters, Transaction } from "@/types";

export type TransactionSummary = {
  totalIncome: number;
  totalExpense: number;
  net: number;
  transactionCount: number;
  averageDailySpend: number;
};

/**
 * Spec A1.1 — Soft Duplicate Warning.
 * Flags a possible duplicate when amount, account, and date all match exactly.
 * Only meant to run on create (not edit — editing a transaction shouldn't warn about itself).
 */
export function findLikelyDuplicate(
  candidate: Pick<Transaction, "amount" | "account" | "date">,
  existing: Transaction[],
  excludeId?: string,
): Transaction | null {
  const candidateDay = candidate.date.slice(0, 10);
  return (
    existing.find(
      (transaction) =>
        transaction.id !== excludeId &&
        transaction.amount === candidate.amount &&
        transaction.account === candidate.account &&
        transaction.date.slice(0, 10) === candidateDay,
    ) ?? null
  );
}

export function summarizeTransactions(
  transactions: Transaction[],
  filters: Pick<GlobalFilters, "dateFrom" | "dateTo">,
): TransactionSummary {
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const expense = sumSpendingExpenses(transactions);
  const days = getDaysInRange(filters.dateFrom, filters.dateTo);

  return {
    totalIncome: income,
    totalExpense: expense,
    net: income - expense,
    transactionCount: transactions.length,
    averageDailySpend: Math.round(expense / days),
  };
}