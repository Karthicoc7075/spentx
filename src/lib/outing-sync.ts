import { buildExpenseSplits } from "@/lib/outings";
import type { Outing, OutingExpense, Transaction } from "@/types";

function isWithinOutingDates(outing: Outing, date: string) {
  const value = new Date(date).getTime();
  const start = new Date(outing.startDate).getTime();
  const end = outing.endDate
    ? new Date(`${outing.endDate}T23:59:59`).getTime()
    : Number.POSITIVE_INFINITY;
  return value >= start && value <= end;
}

export function getOutingCandidatesForTransaction(
  transaction: Transaction,
  outings: Outing[],
  expenses: OutingExpense[],
) {
  if (transaction.type !== "expense") return [];

  const linkedIds = new Set(
    expenses
      .map((expense) => expense.linkedTransactionId)
      .filter(Boolean) as string[],
  );
  if (linkedIds.has(transaction.id)) return [];

  const isDetectable =
    transaction.source === "mobile" ||
    transaction.source === "bank-sync" ||
    transaction.source === "import";

  if (!isDetectable) return [];

  return outings.filter(
    (outing) =>
      outing.status === "active" &&
      outing.autoAddMode &&
      isWithinOutingDates(outing, transaction.date),
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

  const splits = buildExpenseSplits(
    transaction.amount,
    "equally",
    outing.members,
    payer.id,
    outing.members.map((member) => member.id),
  );

  return {
    outingId: outing.id,
    description: transaction.merchant,
    amount: transaction.amount,
    category: transaction.category,
    date: transaction.date.slice(0, 10),
    paidByMemberId: payer.id,
    splitType: "equally" as const,
    splits,
    source: "bank-detected" as const,
    linkedTransactionId: transaction.id,
  };
}