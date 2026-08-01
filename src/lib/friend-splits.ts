import type { FriendSettlement, FriendSplit, TripMember } from "@/types";
import type { MemberNetBalance } from "@/lib/outings";

/**
 * Who-owes-whom for a single friend split, framed the same way outings frame
 * it: the payer is credited the full amount, every member is debited their
 * share, and settlements move the balance back.
 */
export function computeFriendSplitBalances(
  members: TripMember[],
  splits: FriendSplit[],
  settlements: FriendSettlement[],
) {
  const balances = new Map(members.map((member) => [member.id, 0]));

  for (const split of splits) {
    balances.set(
      split.paidByMemberId,
      (balances.get(split.paidByMemberId) ?? 0) + split.amount,
    );
    for (const share of split.splits) {
      balances.set(
        share.memberId,
        (balances.get(share.memberId) ?? 0) - share.amount,
      );
    }
  }

  for (const settlement of settlements) {
    balances.set(
      settlement.fromMemberId,
      (balances.get(settlement.fromMemberId) ?? 0) + settlement.amount,
    );
    balances.set(
      settlement.toMemberId,
      (balances.get(settlement.toMemberId) ?? 0) - settlement.amount,
    );
  }

  return members.map((member) => ({
    member,
    balance: balances.get(member.id) ?? 0,
  }));
}

/**
 * Net position per friend across every friend split, keyed by `friendId` so it
 * merges cleanly with the outing-derived balances from
 * `computeNetBalancesByMember`.
 */
export function computeFriendSplitNetBalances(
  splits: FriendSplit[],
  settlements: FriendSettlement[],
): MemberNetBalance[] {
  const totals = new Map<string, MemberNetBalance>();

  for (const split of splits) {
    const splitSettlements = settlements.filter(
      (item) => item.friendSplitId === split.id,
    );
    const balances = computeFriendSplitBalances(
      split.members,
      [split],
      splitSettlements,
    );

    for (const { member, balance } of balances) {
      // Framed relative to "you" — your own balance against yourself isn't
      // a meaningful "who owes whom" figure.
      if (member.isCurrentUser) continue;
      const key = member.friendId ?? member.id;
      const existing = totals.get(key);
      if (existing) {
        existing.balance += balance;
      } else {
        totals.set(key, { key, name: member.name, balance });
      }
    }
  }

  return [...totals.values()];
}

/**
 * Merge outing-derived and friend-split-derived balances into one per-friend
 * figure. Both sides are keyed by friendId, so a friend you owe on a trip and
 * who owes you on a coffee nets out to a single number.
 */
export function mergeNetBalances(
  ...groups: MemberNetBalance[][]
): MemberNetBalance[] {
  const totals = new Map<string, MemberNetBalance>();
  for (const group of groups) {
    for (const item of group) {
      const existing = totals.get(item.key);
      if (existing) existing.balance += item.balance;
      else totals.set(item.key, { ...item });
    }
  }
  return [...totals.values()].filter((item) => Math.abs(item.balance) >= 1);
}

/** The current user's own share of a split — what the expense actually cost you. */
export function ownShareOfSplit(split: FriendSplit) {
  const me =
    split.members.find((member) => member.isCurrentUser) ?? split.members[0];
  if (!me) return split.amount;
  return (
    split.splits.find((share) => share.memberId === me.id)?.amount ?? 0
  );
}
