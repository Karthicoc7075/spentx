import type { FriendSplit, Outing, Transaction } from "@/types";
import { isSplitExpenseTransaction } from "@/lib/utils";
import { isTransferTransaction } from "@/lib/investments";

/**
 * Which outings a normal transaction may be linked to.
 *
 * Web mirror of the mobile app's `core/utils/outing_link_rules.dart` — same two
 * rules, same defaults, so a transaction that can join a trip on one platform
 * can join it on the other.
 *
 * Nothing here mutates a transaction. Linking sets `outingId` and nothing else:
 * amount, category, purpose, merchant and split data are untouched, and a
 * transaction's purpose is never rewritten to match the trip it joins.
 */

/**
 * Default purpose for a row that carries none, matching how the ledger treats
 * a blank purpose elsewhere — otherwise a transaction with no purpose set
 * would match no trip at all.
 */
export const DEFAULT_PURPOSE_NAME = "Personal";

/**
 * True when the amount is undivided — no Purpose Split, Category Split,
 * Purpose + Category Split, or Friend Split.
 *
 * An outing expense holds ONE amount against ONE category and ONE purpose, so
 * a transaction whose amount is already carved up has no single set of those
 * values to carry into a trip. Rather than picking one slice and dropping the
 * rest, such a row simply cannot be linked.
 *
 * Transfers are excluded too: moving money between your own accounts is not
 * spending, so a trip cannot contain it.
 *
 * @param friendSplits pass the loaded `friend_splits` rows so a transaction
 * split with friends is recognised. Omit only where that data is unavailable —
 * the transaction's own `isGroup`/tags still catch the common case.
 */
export function isSimpleTransaction(
  transaction: Transaction,
  friendSplits: FriendSplit[] = [],
): boolean {
  if (isSplitExpenseTransaction(transaction)) return false;
  if (isTransferTransaction(transaction)) return false;
  if (transaction.tags?.includes("friend_split")) return false;
  if (friendSplits.some((split) => split.transactionId === transaction.id)) {
    return false;
  }
  return true;
}

function effectivePurposeId(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PURPOSE_NAME;
}

/**
 * Whether `outing` is a valid destination for `transaction`.
 *
 * Two independent conditions:
 *
 *  1. The transaction must be undivided — see {@link isSimpleTransaction}.
 *  2. Purposes must agree, but *only when the outing configures one*. An outing
 *     with no purpose imposes no constraint and accepts any eligible row.
 */
export function outingAcceptsTransaction(
  outing: Outing,
  transaction: Transaction,
  friendSplits: FriendSplit[] = [],
): boolean {
  if (!isSimpleTransaction(transaction, friendSplits)) return false;

  const outingPurpose = (outing.purposeId ?? "").trim();
  if (outingPurpose.length === 0) return true;

  return (
    effectivePurposeId(transaction.purposeId).toLowerCase() ===
    outingPurpose.toLowerCase()
  );
}

/**
 * The outings `transaction` may be added to, preserving the caller's ordering.
 *
 * Each outing is judged on its own purpose, so with several trips open the
 * picker offers exactly the ones that match — never a mix the user has to
 * discover is invalid by selecting it.
 */
export function outingsAcceptingTransaction(
  outings: Outing[],
  transaction: Transaction,
  friendSplits: FriendSplit[] = [],
): Outing[] {
  if (!isSimpleTransaction(transaction, friendSplits)) return [];
  return outings.filter((outing) =>
    outingAcceptsTransaction(outing, transaction, friendSplits),
  );
}
