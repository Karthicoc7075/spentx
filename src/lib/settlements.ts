import type { TripMember } from "@/types";

/** Ledger category for every settlement row — kept plural to match the
 * value already stored on existing transactions and read by Wealth,
 * analytics-filter-config and the outing rollup filter. */
export const SETTLEMENT_CATEGORY = "Settlements";

/**
 * A single outstanding balance between you and one friend, from either an
 * outing or a one-off friend split. Both feed the same settle-up flow.
 */
export type SettlementTarget = {
  kind: "outing" | "friend-split";
  /** outing.id or friendSplit.id */
  referenceId: string;
  /** Outing name or split description — the merchant prefix. */
  referenceName: string;
  friendId: string;
  friendName: string;
  friendMemberId: string;
  currentMemberId: string;
  /**
   * Outstanding amount, always positive. Pair with `direction` — the sign
   * convention lives in one place (`settlementDirection`) so no caller has
   * to re-derive who owes whom.
   */
  outstanding: number;
  direction: SettlementDirection;
  /** Already settled against this reference. */
  settled: number;
};

/** "send" = you pay the friend. "receive" = the friend pays you. */
export type SettlementDirection = "send" | "receive";

/**
 * Turns a member balance into a direction.
 *
 * `computeMemberBalances` credits the payer and debits each member's share,
 * so for a FRIEND's member row:
 *   negative  → they consumed more than they paid → they owe you  → "receive"
 *   positive  → you owe them                                     → "send"
 */
export function settlementDirection(friendBalance: number): SettlementDirection {
  return friendBalance < 0 ? "receive" : "send";
}

/** True when the friend owes the current user. */
export function friendOwesYou(friendBalance: number) {
  return friendBalance < -0.01;
}

/** True when the current user owes the friend. */
export function youOweFriend(friendBalance: number) {
  return friendBalance > 0.01;
}

/**
 * Merchant text for a settlement transaction — always
 * "<Reference> (<Friend>)" so the ledger says which bill it belongs to
 * rather than just naming a person.
 */
export function settlementMerchant(referenceName: string, friendName: string) {
  return `${referenceName} (${friendName})`;
}

/** Who pays whom, as member ids for the settlements row. */
export function settlementMembers(
  target: Pick<
    SettlementTarget,
    "direction" | "friendMemberId" | "currentMemberId"
  >,
) {
  return target.direction === "receive"
    ? { fromMemberId: target.friendMemberId, toMemberId: target.currentMemberId }
    : { fromMemberId: target.currentMemberId, toMemberId: target.friendMemberId };
}

/** Settlement status copy for a reference after `paid` has been applied. */
export function settlementStatus(outstanding: number, paid: number) {
  const remaining = Math.max(0, outstanding - paid);
  if (remaining < 1) return { label: "Paid", remaining: 0, isFull: true };
  return { label: "Partially Paid", remaining, isFull: false };
}

export function currentUserMemberId(members: TripMember[]) {
  return (members.find((member) => member.isCurrentUser) ?? members[0])?.id ?? "me";
}

/** Suffix a soft-deleted friend's name so historical rows stay readable. */
export function memberDisplayName(
  member: Pick<TripMember, "name" | "friendId">,
  deletedFriendIds: Set<string>,
) {
  const isDeleted = Boolean(member.friendId && deletedFriendIds.has(member.friendId));
  return isDeleted ? `${member.name} (Deleted)` : member.name;
}

/** True when this member points at a soft-deleted friend. */
export function isDeletedMember(
  member: Pick<TripMember, "friendId">,
  deletedFriendIds: Set<string>,
) {
  return Boolean(member.friendId && deletedFriendIds.has(member.friendId));
}
