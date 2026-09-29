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
  isReimbursementTransaction,
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
  if (isReimbursementTransaction(transaction)) return false;
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
 * Total outing spending in the period — combines outing-linked transactions
 * and unlinked cash expenses logged under outings.
 */
export function sumPeriodOutingSpend(
  transactions: Transaction[],
  outingExpenses: OutingExpense[] = [],
  range?: PeriodRange,
) {
  const txSpend = transactions.reduce((sum, tx) => {
    if (tx.type !== "expense") return sum;
    const isOuting =
      Boolean(tx.outingId) ||
      tx.tags?.includes("outing-analytics") ||
      isOutingRollupLike(tx);
    if (!isOuting) return sum;
    const date = tx.transactionDate ?? tx.date;
    if (!isInPeriodRange(date, range)) return sum;
    return sum + money(tx);
  }, 0);

  const unlinkedSpend = sumUnlinkedOutingSpend(outingExpenses, range);
  return txSpend + unlinkedSpend;
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
    if (!isReimbursementTransaction(tx)) return sum;
    const date = tx.transactionDate ?? tx.date;
    if (!isInPeriodRange(date, range)) return sum;
    return sum + money(tx);
  }, 0);
}

/** Gross cash spending before friend reimbursements are applied. */
export function sumPeriodGrossExpense(
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

  const outingIdsWithRollup = new Set(
    scoped
      .filter((transaction) => isOutingRollupLike(transaction))
      .map((transaction) => transaction.outingId)
      .filter((id): id is string => Boolean(id)),
  );
  const rollupAmountByOuting = new Map<string, number>();
  for (const transaction of scoped) {
    if (!isOutingRollupLike(transaction) || !transaction.outingId) continue;
    const amount = money(transaction);
    const prev = rollupAmountByOuting.get(transaction.outingId) ?? 0;
    if (amount > prev) rollupAmountByOuting.set(transaction.outingId, amount);
  }
  const countedRollupOutings = new Set<string>();

  const ledgerSpend = scoped.reduce((sum, tx) => {
    if (tx.type !== "expense") return sum;
    if (isTransferTransaction(tx)) return sum;

    if (isOutingRollupLike(tx)) {
      if (!includeOutingExpenses) return sum;
      const outingId = tx.outingId;
      if (!outingId) return sum + money(tx);
      if (countedRollupOutings.has(outingId)) return sum;
      countedRollupOutings.add(outingId);
      return sum + (rollupAmountByOuting.get(outingId) ?? money(tx));
    }

    if (tx.outingId && outingIdsWithRollup.has(tx.outingId)) {
      return sum;
    }

    return sum + money(tx);
  }, 0);

  const hasOutingRollup = scoped.some((tx) => isOutingRollupLike(tx));
  const unlinked = (includeOutingExpenses && !hasOutingRollup)
    ? sumUnlinkedOutingSpend(options.unlinkedOutingExpenses ?? [], range)
    : 0;

  return ledgerSpend + unlinked;
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
  const grossExpense = sumPeriodGrossExpense(transactions, options);
  const reimbursements = sumPeriodReturns(transactions, options.range);
  // A repayment can be recorded in a period with no new spending. Expense is
  // never shown as negative; the reimbursement card still exposes the full
  // cash movement and the ledger keeps the original transaction visible.
  return Math.max(0, grossExpense - reimbursements);
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
  const grossExpense = sumPeriodGrossExpense(transactions, options);
  const reimbursements = sumPeriodReturns(transactions, options.range);
  const expense = Math.max(0, grossExpense - reimbursements);
  return {
    income,
    grossExpense,
    reimbursements,
    expense,
    net: income - expense,
  };
}
