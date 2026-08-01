import type { IncomeStream, IncomeTargets, Transaction } from "@/types";

export const defaultIncomeTargets: IncomeTargets = {
  target3Months: 0,
  target6Months: 0,
  target12Months: 0,
  activeHorizon: 6,
};

export function detectIncomeStreamsFromTransactions(
  transactions: Transaction[],
): Omit<IncomeStream, "id" | "userId" | "createdAt" | "updatedAt">[] {
  const incomeTransactions = transactions.filter(
    (transaction) => transaction.type === "income",
  );
  const grouped = new Map<
    string,
    { amount: number; lastReceived: string; count: number }
  >();

  for (const transaction of incomeTransactions) {
    const source = transaction.category || transaction.merchant;
    const current = grouped.get(source) ?? {
      amount: 0,
      lastReceived: transaction.transactionDate,
      count: 0,
    };
    grouped.set(source, {
      amount: current.amount + transaction.totalAmount,
      lastReceived:
        new Date(transaction.transactionDate) > new Date(current.lastReceived)
          ? transaction.transactionDate
          : current.lastReceived,
      count: current.count + 1,
    });
  }

  return [...grouped.entries()].map(([source, data]) => ({
    source,
    amount: Math.round(data.amount / Math.max(1, data.count)),
    frequency: data.count > 1 ? ("monthly" as const) : ("one-time" as const),
    lastReceived: data.lastReceived,
  }));
}

export function getMonthlyIncomeTrend(
  transactions: Transaction[],
  months = 12,
) {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const key = `${date.getFullYear()}-${month}`;
    const label = date.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });

    const income = transactions
      .filter((transaction) => {
        if (transaction.type !== "income") return false;
        const txnDate = new Date(transaction.transactionDate);
        return (
          txnDate.getFullYear() === date.getFullYear() &&
          txnDate.getMonth() === date.getMonth()
        );
      })
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

    return { month: label, income, key };
  });
}

export function getCurrentMonthlyIncome(transactions: Transaction[]) {
  const now = new Date();
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "income") return false;
      const date = new Date(transaction.transactionDate);
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
}

export function getActiveTarget(targets: IncomeTargets) {
  if (targets.activeHorizon === 3) return targets.target3Months;
  if (targets.activeHorizon === 12) return targets.target12Months;
  return targets.target6Months;
}

export function getTargetProgress(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}