import { buildExpenseSplits } from "@/lib/outings";
import type { Outing, OutingExpense, Transaction } from "@/types";

/** Tag applied when user unlinks a spend so auto-add will not re-attach it. */
export const OUTING_UNLINKED_TAG = "outing-unlinked";

export function hasOutingUnlinkedOptOut(transaction: Transaction) {
  return (transaction.tags ?? []).includes(OUTING_UNLINKED_TAG);
}

export function withOutingUnlinkedTag(tags?: string[]) {
  const next = (tags ?? []).filter((t) => t !== OUTING_UNLINKED_TAG);
  next.push(OUTING_UNLINKED_TAG);
  return next;
}

export function withoutOutingUnlinkedTag(tags?: string[]) {
  return (tags ?? []).filter((t) => t !== OUTING_UNLINKED_TAG);
}

/** Inclusive calendar range for an outing (end-of-day on endDate). */
export function isWithinOutingDates(outing: Outing, date: string) {
  if (!date) return false;
  const value = new Date(date).getTime();
  if (Number.isNaN(value)) return false;
  const start = new Date(`${outing.startDate.slice(0, 10)}T00:00:00`).getTime();
  const endRaw = outing.endDate?.slice(0, 10);
  const end = endRaw
    ? new Date(`${endRaw}T23:59:59`).getTime()
    : Number.POSITIVE_INFINITY;
  return value >= start && value <= end;
}

/** Currently running outing that should auto-attach new spends. */
export function getActiveAutoOuting(outings: Outing[]): Outing | null {
  const active = outings.filter(
    (o) => o.status === "active" && !o.isQuickSplit,
  );
  if (active.length === 0) return null;
  // Prefer the one that includes today; else newest start.
  const today = new Date().toISOString().slice(0, 10);
  const running = active.find((o) => isWithinOutingDates(o, today));
  if (running) return running;
  return [...active].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  )[0];
}

export function hasOtherActiveOuting(
  outings: Outing[],
  excludeOutingId?: string,
) {
  return outings.some(
    (o) =>
      o.status === "active" &&
      o.id !== excludeOutingId &&
      o.isActive !== false,
  );
}

/**
 * True only for a transaction the system linked to a real outing BY ITSELF
 * (SMS detection / bank sync / import) — the only case that offers Unlink.
 *
 * `outing_expenses.source === "bank-detected"` is the schema's only auto-link
 * marker: it is written exclusively by [buildOutingExpenseFromTransaction]
 * below. (`Transaction.isAutoDetected` exists in the types but is never read
 * or written anywhere, so it cannot be used.)
 *
 * Deliberately false for manual outing expenses (no linked ledger row),
 * manually linked transactions, and friend splits (hidden quick-split
 * outings) — those are undone by editing the transaction instead.
 */
export function isAutoLinkedOutingTransaction(
  outing: Outing | undefined | null,
  linkedExpense: OutingExpense | undefined | null,
) {
  if (!outing || outing.isQuickSplit) return false;
  if (!linkedExpense?.linkedTransactionId) return false;
  return linkedExpense.source === "bank-detected";
}

/** Bank/SMS/import rows may auto-join an active trip. Manual ledger adds must not. */
export function isBankLikeTransactionSource(transaction: Transaction) {
  const source = (transaction.source ?? "").toLowerCase();
  const entry = (transaction.entrySource ?? "").toLowerCase();
  return (
    source === "mobile" ||
    source === "bank-sync" ||
    source === "import" ||
    source === "sms" ||
    entry.includes("sms") ||
    entry.includes("bank") ||
    entry.includes("mobile")
  );
}

/**
 * Outings that should receive this ledger expense automatically.
 *
 * Rules (one transaction = normal OR outing, never both / never forced):
 *  - If user already set outingId → reconcile that outing only
 *  - If user opted out (outing-unlinked tag) → none
 *  - Auto-link ONLY bank/SMS/import rows during active auto-add trips
 *  - Manual web/app "Add expense" stays normal unless user picks an outing
 */
export function getOutingCandidatesForTransaction(
  transaction: Transaction,
  outings: Outing[],
  expenses: OutingExpense[],
) {
  if (transaction.type !== "expense") return [];
  // Transfers / settlements are not trip spends.
  const cat = (transaction.category ?? "").toLowerCase();
  if (cat === "settlements" || cat === "transfer") return [];
  if ((transaction.tags ?? []).includes("outing-rollup")) return [];

  const linkedIds = new Set(
    expenses
      .map((expense) => expense.linkedTransactionId)
      .filter(Boolean) as string[],
  );
  if (linkedIds.has(transaction.id)) return [];

  // Already tagged by user/SMS — ensure outing expense exists for that outing.
  if (transaction.outingId) {
    const tagged = outings.find((o) => o.id === transaction.outingId);
    return tagged ? [tagged] : [];
  }

  // User explicitly unlinked — do not auto-reattach.
  if (hasOutingUnlinkedOptOut(transaction)) return [];

  // Manual ledger rows must stay "normal" unless the user picks an outing.
  if (!isBankLikeTransactionSource(transaction)) return [];

  const date = transaction.transactionDate ?? transaction.date ?? "";

  return outings.filter(
    (outing) =>
      outing.status === "active" &&
      !outing.isQuickSplit &&
      isWithinOutingDates(outing, date),
  );
}

export function buildOutingExpenseFromTransaction(
  outing: Outing,
  transaction: Transaction,
) {
  const payer =
    outing.members.find((member) => member.isCurrentUser) ??
    outing.members[0];
  if (!payer) return null;

  const amount = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const splits = buildExpenseSplits(
    amount,
    "equally",
    outing.members,
    payer.id,
    outing.members.map((member) => member.id),
  );

  const isBankLike =
    transaction.source === "mobile" ||
    transaction.source === "bank-sync" ||
    transaction.source === "import";

  return {
    outingId: outing.id,
    description: transaction.merchant,
    amount,
    category: transaction.category,
    date: (transaction.transactionDate ?? transaction.date ?? "").slice(0, 10),
    paidByMemberId: payer.id,
    splitType: "equally" as const,
    splits,
    source: (isBankLike ? "bank-detected" : "manual") as
      | "bank-detected"
      | "manual",
    linkedTransactionId: transaction.id,
    accountName:
      transaction.accountName || transaction.account || undefined,
    paymentMode: transaction.paymentMethod || transaction.paymentType || undefined,
  };
}
