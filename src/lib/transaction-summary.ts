import { getDaysInRange } from "@/lib/date-filters";
import {
  isOutingRollupLike,
  isTransferTransaction,
} from "@/lib/investments";
import {
  computePeriodTotals,
  filterUnlinkedOutingExpenses,
  sumPeriodExpense,
  sumPeriodIncome,
} from "@/lib/period-totals";
import { OPENING_BALANCE_CATEGORY } from "@/lib/wealth";
import type {
  Account,
  Category,
  GlobalFilters,
  OutingExpense,
  Transaction,
} from "@/types";

export type TransactionSummary = {
  totalIncome: number;
  totalExpense: number;
  net: number;
  transactionCount: number;
  averageDailySpend: number;
  /** Opening balance shown as a hint only — not mixed into period income. */
  openingBalanceIncome: number;
};

/**
 * Spec A1.1 — Soft Duplicate Warning.
 * Flags a possible duplicate when amount, account, and date all match exactly.
 * Only meant to run on create (not edit — editing a transaction shouldn't warn about itself).
 */
export function findLikelyDuplicate(
  candidate: Pick<
    Transaction,
    "totalAmount" | "accountId" | "transactionDate" | "amount" | "account" | "date"
  >,
  existing: Transaction[],
  excludeId?: string,
): Transaction | null {
  const candidateAmount = candidate.totalAmount ?? candidate.amount;
  const candidateAccount = candidate.accountId ?? candidate.account;
  const candidateDate = candidate.transactionDate ?? candidate.date;
  const candidateDay = candidateDate.slice(0, 10);
  return (
    existing.find(
      (transaction) =>
        transaction.id !== excludeId &&
        (transaction.totalAmount ?? transaction.amount) === candidateAmount &&
        (transaction.accountId ?? transaction.account) === candidateAccount &&
        (transaction.transactionDate ?? transaction.date).slice(0, 10) === candidateDay,
    ) ?? null
  );
}

function money(transaction: Transaction) {
  const value = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * @deprecated Prefer sumPeriodExpense — kept for call sites that only have
 * a display list. Counts visible rows without double-counting rollups.
 */
export function sumVisibleSpending(transactions: Transaction[]) {
  const outingIdsWithRollup = new Set(
    transactions
      .filter((transaction) => isOutingRollupLike(transaction))
      .map((transaction) => transaction.outingId)
      .filter((id): id is string => Boolean(id)),
  );
  const rollupAmountByOuting = new Map<string, number>();
  for (const transaction of transactions) {
    if (!isOutingRollupLike(transaction) || !transaction.outingId) continue;
    const amount = money(transaction);
    const prev = rollupAmountByOuting.get(transaction.outingId) ?? 0;
    if (amount > prev) rollupAmountByOuting.set(transaction.outingId, amount);
  }
  const countedRollupOutings = new Set<string>();

  return transactions.reduce((sum, transaction) => {
    if (transaction.type !== "expense") return sum;
    if (isTransferTransaction(transaction)) return sum;
    // Investment category counts as cash outflow (same as Top Categories / Period Outflow).

    if (isOutingRollupLike(transaction)) {
      const outingId = transaction.outingId;
      if (!outingId) return sum + money(transaction);
      if (countedRollupOutings.has(outingId)) return sum;
      countedRollupOutings.add(outingId);
      return sum + (rollupAmountByOuting.get(outingId) ?? money(transaction));
    }

    if (
      transaction.outingId &&
      outingIdsWithRollup.has(transaction.outingId)
    ) {
      return sum;
    }

    return sum + money(transaction);
  }, 0);
}

export type SummarizeTransactionsOptions = {
  /**
   * FULL ledger for the period (not the display list). Required so outing
   * rollups are not double-counted against linked spends.
   */
  ledgerTransactions?: Transaction[];
  /** All outing expenses — unlinked cash is added once to expense. */
  outingExpenses?: OutingExpense[];
  categories?: Category[];
  /**
   * When true (default), Total Income = period activity only (matches
   * Dashboard Period Inflow). Opening balance is returned separately as
   * openingBalanceIncome for the optional strip hint.
   */
  periodIncomeOnly?: boolean;
};

/**
 * Transactions strip totals — same formulas as Dashboard period KPIs so
 * Income / Expense / Net never drift (e.g. 9990 vs 8990).
 */
export function summarizeTransactions(
  transactions: Transaction[],
  filters: Pick<GlobalFilters, "dateFrom" | "dateTo">,
  accounts: Account[] = [],
  options: SummarizeTransactionsOptions = {},
): TransactionSummary {
  const range = { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  const ledger = options.ledgerTransactions ?? transactions;
  const unlinked = filterUnlinkedOutingExpenses(options.outingExpenses ?? []);
  const periodIncomeOnly = options.periodIncomeOnly !== false;

  const period = computePeriodTotals(ledger, {
    range,
    unlinkedOutingExpenses: unlinked,
    categories: options.categories,
  });

  // Opening balance is capital, not period income — show as hint only.
  const openingBalanceCategory = OPENING_BALANCE_CATEGORY.toLowerCase();
  const openingFromTxs = ledger
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        (transaction.category ?? "").toLowerCase() === openingBalanceCategory,
    )
    .reduce((sum, transaction) => sum + money(transaction), 0);
  const openingFromAccounts = accounts
    .filter((account) => account.isActive !== false)
    .reduce((sum, account) => sum + (Number(account.openingBalance) || 0), 0);
  const openingBalanceIncome =
    openingFromTxs > 0 ? openingFromTxs : openingFromAccounts;

  const income = periodIncomeOnly
    ? period.income
    : period.income + openingBalanceIncome;
  const expense = period.expense;
  const days = getDaysInRange(filters.dateFrom, filters.dateTo);

  // Count rows the user sees on the list (display list), not the raw ledger.
  const transactionCount = transactions.length;

  return {
    totalIncome: income,
    totalExpense: expense,
    net: income - expense,
    transactionCount,
    averageDailySpend: Math.round(expense / Math.max(1, days)),
    openingBalanceIncome,
  };
}

// Re-export helpers used by tests / other modules.
export { sumPeriodExpense, sumPeriodIncome };
