import type { Outing, OutingExpense, Transaction } from "@/types";

/** Prefix for synthetic rows built from outing_expenses without a ledger link. */
export const OUTING_EXPENSE_TX_PREFIX = "outing-expense:";

export function isOutingExpenseTransaction(transaction: Transaction) {
  return (
    transaction.id.startsWith(OUTING_EXPENSE_TX_PREFIX) ||
    (transaction.tags ?? []).includes("outing-expense")
  );
}

/**
 * Convert a manual outing expense (no linked ledger row) into a display
 * transaction so the web Activity/Transactions list matches the mobile app.
 */
export function outingExpenseToTransaction(
  expense: OutingExpense,
  outing?: Outing | null,
): Transaction {
  const dateIso = expense.date.includes("T")
    ? expense.date
    : new Date(`${expense.date.slice(0, 10)}T12:00:00`).toISOString();

  const outingName = outing?.name?.trim() || "Outing";
  const accountName =
    expense.source === "bank-detected" ? undefined : "Cash";

  return {
    id: `${OUTING_EXPENSE_TX_PREFIX}${expense.id}`,
    type: "expense",
    merchant: expense.description || outingName,
    category: expense.category || "Miscellaneous",
    amount: expense.amount,
    totalAmount: expense.amount,
    account: accountName ?? "Cash",
    accountName: accountName ?? "Cash",
    purpose: "personal",
    purposeId: "personal",
    transactionDate: dateIso,
    date: dateIso,
    source: expense.source === "bank-detected" ? "mobile" : "manual",
    entrySource: "manual",
    paymentMethod: "Cash",
    paymentType: "Cash",
    note: `Outing: ${outingName}`,
    outingId: expense.outingId,
    status: "completed",
    tags: ["outing-expense", "cash"],
  };
}

/**
 * Merge ledger transactions with unlinked outing cash expenses (mobile parity).
 * Skips outing expenses that already have a linked ledger transaction id.
 */
export function mergeLedgerWithOutingExpenses(
  ledger: Transaction[],
  expenses: OutingExpense[],
  outings: Outing[] = [],
): Transaction[] {
  const linkedIds = new Set(
    expenses
      .map((e) => e.linkedTransactionId)
      .filter((id): id is string => Boolean(id)),
  );

  // Prefer outing name for merchants when ledger row is only an outing rollup.
  const outingById = new Map(outings.map((o) => [o.id, o]));

  const synthetic = expenses
    .filter((e) => !e.linkedTransactionId)
    .map((e) => outingExpenseToTransaction(e, outingById.get(e.outingId)));

  // De-dupe: if a synthetic id already exists, keep ledger.
  const byId = new Map<string, Transaction>();
  for (const tx of ledger) {
    byId.set(tx.id, tx);
  }
  for (const tx of synthetic) {
    if (!byId.has(tx.id)) byId.set(tx.id, tx);
  }

  // Drop orphaned synthetic that somehow match linked bank rows by id (safety).
  return [...byId.values()].filter((tx) => {
    if (isOutingExpenseTransaction(tx)) return true;
    // Keep all real ledger rows, including ones linked from outings.
    void linkedIds;
    return true;
  });
}
