import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import type {
  ExpenseSplit,
  Outing,
  OutingExpense,
  OutingSettlement,
  SplitType,
  Transaction,
  TripMember,
  TripSummary,
} from "@/types";

export function buildEqualSplits(
  amount: number,
  memberIds: string[],
): ExpenseSplit[] {
  if (!memberIds.length) return [];
  const share = Math.round(amount / memberIds.length);
  const remainder = amount - share * memberIds.length;

  return memberIds.map((memberId, index) => ({
    memberId,
    amount: share + (index === 0 ? remainder : 0),
  }));
}

export function buildSoloSplit(
  amount: number,
  memberId: string,
): ExpenseSplit[] {
  return [{ memberId, amount }];
}

export function buildExpenseSplits(
  amount: number,
  splitType: SplitType,
  members: TripMember[],
  paidByMemberId: string,
  participantIds: string[],
  customSplits?: ExpenseSplit[],
) {
  if (splitType === "solo") {
    return buildSoloSplit(amount, paidByMemberId);
  }
  if (splitType === "custom" && customSplits?.length) {
    return customSplits;
  }
  const ids =
    participantIds.length > 0
      ? participantIds
      : members.map((member) => member.id);
  return buildEqualSplits(amount, ids);
}

export function computeMemberBalances(
  members: TripMember[],
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
) {
  const balances = new Map(members.map((member) => [member.id, 0]));

  for (const expense of expenses) {
    balances.set(
      expense.paidByMemberId,
      (balances.get(expense.paidByMemberId) ?? 0) + expense.amount,
    );
    for (const split of expense.splits) {
      balances.set(
        split.memberId,
        (balances.get(split.memberId) ?? 0) - split.amount,
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

export function getCurrentUserMember(members: TripMember[]) {
  return members.find((member) => member.isCurrentUser) ?? members[0];
}

export function computeTripSummary(
  outing: Outing,
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
): TripSummary {
  const currentMember = getCurrentUserMember(outing.members);
  const totalSpent = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  const yourShare = expenses.reduce((sum, expense) => {
    const split = expense.splits.find(
      (item) => item.memberId === currentMember?.id,
    );
    return sum + (split?.amount ?? 0);
  }, 0);

  const balances = computeMemberBalances(
    outing.members,
    expenses,
    settlements,
  );
  const currentBalance =
    balances.find((item) => item.member.id === currentMember?.id)?.balance ?? 0;
  const pendingSettlements = Math.max(0, -currentBalance);

  return { totalSpent, yourShare, pendingSettlements };
}

export function computeSpendingByCategory(expenses: OutingExpense[]) {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(
      expense.category,
      (totals.get(expense.category) ?? 0) + expense.amount,
    );
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeSpendingByMember(
  outing: Outing,
  expenses: OutingExpense[],
) {
  const totals = new Map(outing.members.map((member) => [member.id, 0]));

  for (const expense of expenses) {
    for (const split of expense.splits) {
      totals.set(
        split.memberId,
        (totals.get(split.memberId) ?? 0) + split.amount,
      );
    }
  }

  return outing.members
    .map((member) => ({
      member,
      amount: totals.get(member.id) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type DebtEdge = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

export function simplifyDebts(
  balances: Array<{ member: TripMember; balance: number }>,
): DebtEdge[] {
  const creditors: { id: string; name: string; amount: number }[] = [];
  const debtors: { id: string; name: string; amount: number }[] = [];

  for (const item of balances) {
    if (item.balance > 0.01) {
      creditors.push({
        id: item.member.id,
        name: item.member.name,
        amount: item.balance,
      });
    } else if (item.balance < -0.01) {
      debtors.push({
        id: item.member.id,
        name: item.member.name,
        amount: -item.balance,
      });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const edges: DebtEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settle = Math.min(creditors[i].amount, debtors[j].amount);
    if (settle > 0.01) {
      edges.push({
        fromId: debtors[j].id,
        fromName: debtors[j].name,
        toId: creditors[i].id,
        toName: creditors[i].name,
        amount: Math.round(settle * 100) / 100,
      });
    }
    creditors[i].amount -= settle;
    debtors[j].amount -= settle;
    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  return edges;
}

export function getMemberPaidAndShare(
  memberId: string,
  expenses: OutingExpense[],
) {
  const paid = expenses
    .filter((expense) => expense.paidByMemberId === memberId)
    .reduce((sum, expense) => sum + expense.amount, 0);

  const share = expenses.reduce((sum, expense) => {
    const split = expense.splits.find((item) => item.memberId === memberId);
    return sum + (split?.amount ?? 0);
  }, 0);

  return { paid, share };
}

export function getPendingSettlements(
  members: TripMember[],
  expenses: OutingExpense[],
  settlements: OutingSettlement[],
) {
  return computeMemberBalances(members, expenses, settlements).filter(
    (item) => Math.abs(item.balance) >= 1,
  );
}

export function hasOutingRollupTransaction(
  transactions: Transaction[],
  outingId: string,
) {
  return transactions.some(
    (transaction) =>
      transaction.outingId === outingId &&
      transaction.type === "expense" &&
      transaction.category !== "Settlements",
  );
}

export function buildOutingRollupDraft(
  outing: Outing,
  yourShare: number,
  defaultAccount: string,
  defaultCategory = "",
): Omit<Transaction, "id"> {
  const date = outing.endDate ?? new Date().toISOString().slice(0, 10);

  return {
    type: "expense",
    amount: yourShare,
    merchant: outing.name,
    category: defaultCategory,
    account: defaultAccount,
    purpose: PERSONAL_PURPOSE_ID,
    source: "manual",
    date: new Date(date).toISOString(),
    note: outing.name,
    outingId: outing.id,
  };
}