import { isOutingRollupTransaction } from "@/lib/outings";
import type { Category, Transaction } from "@/types";

const LEGACY_INVESTMENT_CATEGORY_NAME = "investment";

/**
 * An "investment" is just an expense transaction whose category is
 * flagged `isInvestment` — no separate entity, no separate form.
 * `categories` is optional: callers that can't easily thread the list
 * through fall back to matching the category named "Investment", which
 * covers the common case without requiring every call site to change.
 */
export function isInvestmentCategory(categoryName: string, categories: Category[] = []) {
  const normalized = categoryName.trim().toLowerCase();
  if (!normalized) return false;
  const category = categories.find((item) => item.name.toLowerCase() === normalized);
  if (category?.isInvestment === true) return true;
  // Common names when is_investment flag is missing from cache.
  return (
    normalized === LEGACY_INVESTMENT_CATEGORY_NAME ||
    normalized === "investments" ||
    normalized === "mutual fund" ||
    normalized === "mutual funds" ||
    normalized === "stocks" ||
    normalized === "sip"
  );
}

export function isInvestmentTransaction(
  transaction: Transaction,
  categories: Category[] = [],
) {
  if (transaction.type !== "expense") return false;
  if (isTransferTransaction(transaction)) return false;
  if (isOutingRollupLike(transaction)) return false;
  return isInvestmentCategory(transaction.category, categories);
}

export function isTransferTransaction(transaction: Transaction) {
  const cat = (transaction.category ?? "").trim().toLowerCase();
  const tags = transaction.tags ?? [];
  if (tags.some((tag) => tag === "settlement" || tag.startsWith("settlement:"))) {
    return true;
  }
  // Unified detection — either client may write category and/or tags:
  //  - Web: category Settlements + tags transfer / transfer_to:*
  //  - Flutter: category Transfer + tags transfer / transfer_to:*
  if (tags.includes("transfer")) return true;
  if (tags.some((t) => t.startsWith("transfer_to:"))) return true;
  if (cat === "settlements" || cat === "transfer") return true;
  const merchant = (transaction.merchant ?? "").trim().toLowerCase();
  if (merchant.startsWith("transfer to ") || merchant.startsWith("transfer from ")) {
    return true;
  }
  if (merchant.startsWith("tr ") && merchant.includes(" to ")) return true;
  return false;
}

const REIMBURSEMENT_CATEGORIES = new Set([
  "friend returns",
  "friend repayment",
  "repayment",
]);

/**
 * A repayment remains an income-typed ledger row so account balances reflect
 * money arriving, but it is not earned income. Period totals apply it as an
 * expense reversal instead.
 */
export function isReimbursementTransaction(transaction: Transaction) {
  if (transaction.type !== "income") return false;
  const category = (transaction.category ?? "").trim().toLowerCase();
  const tags = transaction.tags ?? [];
  return (
    REIMBURSEMENT_CATEGORIES.has(category) ||
    tags.includes("reimbursement") ||
    tags.includes("friend_return") ||
    tags.includes("friend-return") ||
    tags.includes("settlement:receive")
  );
}

/** True for either side of a friend or outing settlement. */
export function isSettlementTransaction(transaction: Transaction) {
  const category = (transaction.category ?? "").trim().toLowerCase();
  const tags = transaction.tags ?? [];
  return (
    category === "settlement" ||
    category === "settlements" ||
    tags.some((tag) => tag === "settlement" || tag.startsWith("settlement:"))
  );
}

/**
 * Display-only outing total on Transactions — never counts as spend twice
 * in net-worth / analytics (real money is on individual ledger rows or
 * unlinked outing cash). Matches full rollup detection (tag + legacy).
 */
export function isOutingRollupLike(transaction: Transaction) {
  return isOutingRollupTransaction(transaction);
}

/**
 * Cash-leaving expense for Top Categories, Cash Flow, Period Outflow, etc.
 * Includes Investment category spends (normal money out). Excludes only
 * transfers and outing-rollup display rows (not real double cash).
 *
 * Net worth still does NOT re-add investment as an asset — money already
 * left cash/bank when the expense was booked.
 */
export function isSpendingExpense(transaction: Transaction, categories: Category[] = []) {
  void categories; // kept for call-site compatibility
  return (
    transaction.type === "expense" &&
    !isTransferTransaction(transaction) &&
    !isOutingRollupLike(transaction)
  );
}

function money(transaction: Transaction) {
  const value = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function sumInvestments(transactions: Transaction[], categories: Category[] = []) {
  return transactions
    .filter((transaction) => isInvestmentTransaction(transaction, categories))
    .reduce((sum, transaction) => sum + money(transaction), 0);
}

export function sumSpendingExpenses(
  transactions: Transaction[],
  categories: Category[] = [],
) {
  return transactions
    .filter((transaction) => isSpendingExpense(transaction, categories))
    .reduce((sum, transaction) => sum + money(transaction), 0);
}
