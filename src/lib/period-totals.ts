/**
 * Single source of truth for period Income / Expense / Net across
 * Dashboard KPIs and the Transactions summary strip.
 *
 * Rules (must match cash leaving the accounts):
 *  - Income: real income only (no Opening Balance, no transfer/settlement)
 *  - Expense / Period Outflow: all real expenses including Investment
 *    (no outing-rollup display rows, no transfers) PLUS unlinked outing cash
 *  - Never count rollup + linked expenses (that was the ₹1,000 drift)
 *  - Wealth net worth still does not re-add investment as an asset
 */

import {
  isOutingRollupLike,
  isTransferTransaction,
  sumSpendingExpenses,
} from "@/lib/investments";
import { OPENING_BALANCE_CATEGORY } from "@/lib/wealth";
import type { Category, OutingExpense, Transaction } from "@/types";

export type PeriodRange = {
  dateFrom?: string;
  dateTo?: string;
};

function money(transaction: Pick<Transaction, "totalAmount" | "amount">) {
  const value = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dayKey(raw?: string | null) {
  if (!raw) return "";
  const value = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : "";
}

export function isInPeriodRange(rawDate: string | undefined | null, range?: PeriodRange) {
  if (!range?.dateFrom && !range?.dateTo) return true;
  const day = dayKey(rawDate);
  if (!day) return false;
  if (range.dateFrom && day < range.dateFrom) return false;
  if (range.dateTo && day > range.dateTo) return false;
  return true;
}

export function isPeriodIncome(transaction: Transaction) {
  if (transaction.type !== "income") return false;
  const cat = (transaction.category ?? "").trim().toLowerCase();
  if (cat === OPENING_BALANCE_CATEGORY.toLowerCase()) return false;
  if (
    cat === "settlements" ||
    cat === "settlement" ||
    cat === "repayment" ||
    cat === "friend repayment" ||
    cat === "transfer"
  ) {
    return false;
  }
  if (isTransferTransaction(transaction)) return false;
  return true;
}

export function isPeriodExpense(
  transaction: Transaction,
  _categories: Category[] = [],
  options: { includeOutingExpenses?: boolean } = {},
) {
  // Includes Investment category (normal cash outflow).
  if (transaction.type !== "expense") return false;
  if (isTransferTransaction(transaction)) return false;
  if (isOutingRollupLike(transaction)) return false;

  const includeOuting = options.includeOutingExpenses ?? true;
  if (!includeOuting && (transaction.outingId || transaction.tags?.includes("outing-analytics"))) {
    return false;
  }

  return true;
}

/** Unlinked manual outing cash (not already on the ledger). */
export function filterUnlinkedOutingExpenses(expenses: OutingExpense[] = []) {
  return expenses.filter(
    (expense) =>
      !expense.linkedTransactionId && expense.source !== "bank-detected",
  );
}

export function sumUnlinkedOutingSpend(
  expenses: OutingExpense[] = [],
  range?: PeriodRange,
) {
  return filterUnlinkedOutingExpenses(expenses).reduce((sum, expense) => {
    if (!isInPeriodRange(expense.date, range)) return sum;
    return sum + (Number(expense.amount) || 0);
  }, 0);
}

/**
 * Period inflow — same number on Dashboard "Period Inflow" and
 * Transactions "Total Income" (period activity, not opening balance).
 */
export function sumPeriodIncome(
  transactions: Transaction[],
  range?: PeriodRange,
) {
  return transactions.reduce((sum, transaction) => {
    if (!isPeriodIncome(transaction)) return sum;
    const date = transaction.transactionDate ?? transaction.date;
    if (!isInPeriodRange(date, range)) return sum;
    return sum + money(transaction);
  }, 0);
}

export function sumPeriodReturns(transactions: Transaction[], range?: PeriodRange) {
  return transactions.reduce((sum, tx) => {
    if (tx.type === "expense") return sum;
    const cat = (tx.category ?? "").trim().toLowerCase();
    if (
      cat === "repayment" ||
      cat === "friend repayment" ||
      cat === "settlement" ||
      cat === "settlements"
    ) {
      const date = tx.transactionDate ?? tx.date;
      if (!isInPeriodRange(date, range)) return sum;
      return sum + money(tx);
    }
    return sum;
  }, 0);
}

/**
 * Period outflow — net spending expenses minus returns/settlements.
 * Use the FULL ledger, not the Transactions display list (display list
 * hides individuals and shows a rollup that must not double-count).
 */
export function sumPeriodExpense(
  transactions: Transaction[],
  options: {
    range?: PeriodRange;
    unlinkedOutingExpenses?: OutingExpense[];
    categories?: Category[];
    includeOutingExpenses?: boolean;
  } = {},
) {
  const { range, categories = [], includeOutingExpenses = true } = options;

  let scoped = transactions;
  if (!includeOutingExpenses) {
    scoped = scoped.filter(
      (tx) => !tx.outingId && !tx.tags?.includes("outing-analytics") && !isOutingRollupLike(tx),
    );
  }

  if (range) {
    scoped = scoped.filter((transaction) =>
      isInPeriodRange(transaction.transactionDate ?? transaction.date, range),
    );
  }

  const hasOutingRollup = scoped.some((tx) => isOutingRollupLike(tx) || tx.tags?.includes("outing-analytics"));
  const ledgerSpend = sumSpendingExpenses(scoped, categories);
  // Unlinked manual cash is only added if outing rollups are not already present in scoped
  const unlinked = (includeOutingExpenses && !hasOutingRollup)
    ? sumUnlinkedOutingSpend(options.unlinkedOutingExpenses ?? [], range)
    : 0;

  return ledgerSpend + unlinked;
}

export function computePeriodTotals(
  transactions: Transaction[],
  options: {
    range?: PeriodRange;
    unlinkedOutingExpenses?: OutingExpense[];
    categories?: Category[];
    includeOutingExpenses?: boolean;
  } = {},
) {
  const income = sumPeriodIncome(transactions, options.range);
  const expense = sumPeriodExpense(transactions, options);
  return {
    income,
    expense,
    net: income - expense,
  };
}
