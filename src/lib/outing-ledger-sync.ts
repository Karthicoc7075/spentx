/**
 * Single place for outing ↔ ledger consistency after create/update.
 *
 * When an outing changes, or any expense/transaction on that outing changes:
 *  - recompute the single "Outing total" rollup row
 *  - remove duplicate rollups
 *  - keep DB + Transactions page in sync
 *
 * Outing delete/restore is handled server-side by the cascade_delete_outing /
 * restore_deleted_outing RPCs (see deleteOuting / restoreOuting in
 * supabase-data.ts) — soft-deleting the outing and everything linked to it
 * atomically, rather than unlinking ledger rows client-side.
 */

import {
  buildOutingRollupDraft,
  computeOutingRollupAmount,
  computeOutingUserPaidAmount,
  findAllOutingRollupTransactions,
  latestOutingExpenseDate,
} from "@/lib/outings";
import {
  addTransaction,
  deleteOutingExpense,
  deleteTransaction,
  fetchOutingExpenses,
  fetchOutings,
  fetchTransactions,
  saveOuting,
  updateTransaction,
} from "@/lib/supabase-data";
import type { Outing, OutingExpense, Transaction } from "@/types";

/**
 * Recompute / create / delete the display rollup for one outing.
 * Safe to call after any expense or linked-transaction change.
 */
export async function syncOutingRollupLedger(
  userId: string | undefined,
  outingId: string,
  options: { defaultAccountName?: string } = {},
): Promise<void> {
  if (!userId || !outingId) return;

  const [outings, expenses, transactions] = await Promise.all([
    fetchOutings(userId),
    fetchOutingExpenses(userId, outingId),
    fetchTransactions(userId),
  ]);

  const outing = outings.find((item) => item.id === outingId);
  // Two different totals on purpose: the trip's full spend is what the outing
  // itself stores, while the personal ledger row only ever shows what THIS
  // user paid (a friend's payment is not your expense).
  const tripTotal = computeOutingRollupAmount(
    expenses,
    undefined,
    transactions,
    outingId,
  );
  const amount = outing
    ? computeOutingUserPaidAmount(outing, expenses, transactions, outingId)
    : 0;

  const rollups = findAllOutingRollupTransactions(transactions, outingId).sort(
    (a, b) =>
      new Date(b.transactionDate ?? b.date ?? 0).getTime() -
      new Date(a.transactionDate ?? a.date ?? 0).getTime(),
  );
  const keep = rollups[0] ?? null;

  // Drop duplicates always.
  for (const extra of rollups) {
    if (keep && extra.id === keep.id) continue;
    await deleteTransaction(userId, extra.id);
  }

  // No personal spend on this trip → no personal ledger row, but the outing
  // still keeps its own (possibly non-zero) trip total.
  if (!outing || amount <= 0) {
    if (keep) await deleteTransaction(userId, keep.id);
    if (outing) {
      await saveOuting(userId, { ...outing, totalSpent: tripTotal });
    }
    return;
  }

  const defaultAccount =
    options.defaultAccountName ||
    keep?.account ||
    keep?.accountName ||
    "Cash";
  const category =
    expenses.find((e) => e.category)?.category ||
    keep?.category ||
    "Travel";
  const payload = buildOutingRollupDraft(
    outing,
    amount,
    defaultAccount,
    category,
    latestOutingExpenseDate(expenses),
  );

  if (keep) {
    await updateTransaction(userId, keep.id, {
      ...payload,
      amount,
      totalAmount: amount,
    });
  } else {
    await addTransaction(userId, payload);
  }

  await saveOuting(userId, { ...outing, totalSpent: tripTotal });
}

/** Recompute rollups for every active outing (after mobile expense edits). */
export async function syncAllOutingRollups(
  userId: string | undefined,
  options: { defaultAccountName?: string } = {},
): Promise<void> {
  if (!userId) return;
  const outings = await fetchOutings(userId);
  for (const outing of outings) {
    await syncOutingRollupLedger(userId, outing.id, options);
  }
}

/**
 * After a ledger transaction is deleted or unlinked, drop orphan outing_expenses
 * that pointed at it, then refresh the rollup for every affected outing.
 */
export async function afterTransactionRemovedFromOuting(
  userId: string | undefined,
  transaction: Pick<Transaction, "id" | "outingId">,
  options: { previousOutingId?: string | null } = {},
): Promise<void> {
  if (!userId) return;

  const expenses = await fetchOutingExpenses(userId);
  const linked = expenses.filter(
    (expense) => expense.linkedTransactionId === transaction.id,
  );
  const outingIds = new Set<string>();
  if (transaction.outingId) outingIds.add(transaction.outingId);
  if (options.previousOutingId) outingIds.add(options.previousOutingId);

  for (const expense of linked) {
    outingIds.add(expense.outingId);
    await deleteOutingExpense(userId, expense.id);
  }

  for (const outingId of outingIds) {
    await syncOutingRollupLedger(userId, outingId);
  }
}

/**
 * After outing expenses change (add/edit/delete on trip detail), refresh rollup.
 */
export async function afterOutingExpensesChanged(
  userId: string | undefined,
  outingId: string | undefined,
  options: { defaultAccountName?: string } = {},
): Promise<void> {
  if (!userId || !outingId) return;
  await syncOutingRollupLedger(userId, outingId, options);
}

/**
 * After outing metadata update (rename, dates, etc.), refresh rollup merchant/name.
 */
export async function afterOutingUpdated(
  userId: string | undefined,
  outing: Outing,
  expenses?: OutingExpense[],
  options: { defaultAccountName?: string } = {},
): Promise<void> {
  if (!userId || !outing.id) return;
  // Ensure total_spent stays correct even if expenses arg not passed.
  const list = expenses ?? (await fetchOutingExpenses(userId, outing.id));
  await syncOutingRollupLedger(userId, outing.id, options);
  // syncOutingRollupLedger already updates totalSpent; re-save name-only edge cases
  // are covered by the rollup draft using current outing from fetchOutings.
  void list;
}
