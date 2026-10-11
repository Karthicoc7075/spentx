import { isOutingRollupTransaction } from "@/lib/outings";
import type { Category, Investment, InvestmentAssetType, Transaction } from "@/types";

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
  if (
    transaction.isActive === false ||
    Boolean(transaction.deletedAt) ||
    transaction.status === "unverified" ||
    transaction.status === "rejected" ||
    transaction.status === "deleted"
  ) {
    return false;
  }
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
  if (
    transaction.isActive === false ||
    Boolean(transaction.deletedAt) ||
    transaction.status === "unverified" ||
    transaction.status === "rejected" ||
    transaction.status === "deleted"
  ) {
    return false;
  }
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
  if (
    transaction.isActive === false ||
    Boolean(transaction.deletedAt) ||
    transaction.status === "unverified" ||
    transaction.status === "rejected" ||
    transaction.status === "deleted"
  ) {
    return false;
  }
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

// ---------------------------------------------------------------------------
// Holdings (public.investments) — shared maths with the mobile app
// (lib/features/investments/data/investment_math.dart) and the
// investment_totals view, so every screen shows the same numbers.
// ---------------------------------------------------------------------------

export const INVESTMENT_TYPE_LABELS: Record<InvestmentAssetType, string> = {
  mutual_fund: "Mutual Fund",
  stocks: "Stocks & Equity",
  fixed_deposit: "Fixed Deposit",
  gold: "Gold / Commodities",
  bonds: "Bonds / Debt",
  crypto: "Cryptocurrency",
  real_estate: "Real Estate",
  liquid: "Liquid / Cash Fund",
  other: "Other Investment",
};

export const INVESTMENT_TYPES = Object.keys(INVESTMENT_TYPE_LABELS) as InvestmentAssetType[];

/** Expense category for money moved into a holding (same name on mobile). */
export const INVESTMENT_TX_CATEGORY = "Investment";

export function gainPercentOf(invested: number, current: number) {
  return invested > 0 ? ((current - invested) / invested) * 100 : 0;
}

export type PortfolioTotals = {
  invested: number;
  current: number;
  gain: number;
  gainPercent: number;
  /** Investment-category spends not linked to any holding. */
  unlinkedSpend: number;
  holdingCount: number;
};

/**
 * Holdings count once. An investment-category expense is added only when it
 * is NOT linked to a holding (otherwise "add investment + deduct from bank"
 * would be counted twice).
 */
export function computePortfolio(
  investments: Investment[],
  transactions: Transaction[],
  categories: Category[] = [],
): PortfolioTotals {
  let invested = 0;
  let current = 0;
  const linked = new Set<string>();
  const live = investments.filter((item) => !item.deletedAt);
  for (const item of live) {
    invested += Number(item.investedAmount) || 0;
    current += Number(item.currentValue) || 0;
    for (const id of item.sourceTransactionIds ?? []) linked.add(id);
  }
  let unlinked = 0;
  for (const tx of transactions) {
    if (!isInvestmentTransaction(tx, categories)) continue;
    if (linked.has(tx.id)) continue;
    unlinked += money(tx);
  }
  const totalInvested = invested + unlinked;
  const totalCurrent = current + unlinked;
  return {
    invested: totalInvested,
    current: totalCurrent,
    gain: totalCurrent - totalInvested,
    gainPercent: gainPercentOf(totalInvested, totalCurrent),
    unlinkedSpend: unlinked,
    holdingCount: live.length,
  };
}

/** "25,000", "₹ 1,20,000.50" -> number; null when empty or not a number. */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
