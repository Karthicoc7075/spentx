import type { Transaction } from "@/types";

/** Shared financial eligibility. Missing legacy status remains confirmed;
 * explicit unknown/unrecognized statuses stay review-only. A refunded
 * original remains eligible so existing refund netting is preserved.
 * This never changes the stored row or controls Activity visibility.
 */
export function isConfirmedTransaction(transaction: Transaction): boolean {
  if (transaction.isActive === false || transaction.deletedAt) return false;
  const status = String(transaction.status ?? "completed").trim().toLowerCase();
  return status === "completed" || status === "success" || status === "refunded";
}
