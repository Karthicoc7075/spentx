import { isTransferTransaction, isOutingRollupLike } from "@/lib/investments";
import type { Category, Transaction } from "@/types";

/** Colors for outing-type categories on Analysis (Trip / Temple / …). */
const OUTING_CATEGORY_COLORS: Record<string, string> = {
  Trip: "#8b7ff0",
  Temple: "#f59e0b",
  Restaurant: "#10b981",
  Movies: "#ec4899",
  Other: "#64748b",
};

function transactionAmount(
  transaction: Pick<Transaction, "totalAmount" | "amount">,
) {
  return transaction.totalAmount ?? transaction.amount ?? 0;
}

/** Shared category spend rollup — used by Dashboard Top Categories and Analysis. */
export function buildCategoryTotals(
  transactions: Transaction[],
  categories: Category[],
  limit?: number,
) {
  const colorByName = new Map(
    categories.map((category) => [category.name, category.color]),
  );
  const totals = new Map<string, number>();

  const outingIdsWithRollup = new Set(
    transactions
      .filter((transaction) => isOutingRollupLike(transaction))
      .map((transaction) => transaction.outingId)
      .filter((id): id is string => Boolean(id)),
  );
  const countedRollupOutings = new Set<string>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    if (isTransferTransaction(transaction)) continue;

    if (isOutingRollupLike(transaction)) {
      const outingId = transaction.outingId;
      if (outingId) {
        if (countedRollupOutings.has(outingId)) continue;
        countedRollupOutings.add(outingId);
      }
      const amount = transactionAmount(transaction);
      if (amount <= 0) continue;
      const name = (transaction.category || "Trip").trim() || "Trip";
      totals.set(name, (totals.get(name) ?? 0) + amount);
      continue;
    }

    if (transaction.outingId && outingIdsWithRollup.has(transaction.outingId)) {
      continue;
    }

    // Split Expense — attribute each split's own amount to its own
    // category, instead of the whole transaction to just its first split.
    if (transaction.hasSplits && (transaction.splits?.length ?? 0) > 1) {
      for (const split of transaction.splits!) {
        if (split.amount <= 0) continue;
        const name = (split.categoryId || "Other").trim() || "Other";
        totals.set(name, (totals.get(name) ?? 0) + split.amount);
      }
      continue;
    }

    const amount = transactionAmount(transaction);
    if (amount <= 0) continue;
    const name = (transaction.category || "Other").trim() || "Other";
    totals.set(name, (totals.get(name) ?? 0) + amount);
  }

  const sorted = Array.from(totals.entries())
    .map(([name, value]) => ({
      name,
      color:
        colorByName.get(name) ?? OUTING_CATEGORY_COLORS[name] ?? "#64748b",
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return limit ? sorted.slice(0, limit) : sorted;
}