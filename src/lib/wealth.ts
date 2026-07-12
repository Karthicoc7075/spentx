import { isInvestmentTransaction } from "@/lib/investments";
import {
  getActivePurposes,
  PERSONAL_PURPOSE_ID,
  transactionMatchesPurpose,
} from "@/lib/purposes";
import type {
  Account,
  EmergencyFundHealth,
  Investment,
  InvestmentSummary,
  NetWorthBreakdown,
  NetWorthHistoryPoint,
  Purpose,
  SavingsGoal,
  Transaction,
  WealthFilter,
} from "@/types";

export const defaultFutureSelfInputs = {
  currentAge: 21,
  monthlySavings: 5000,
  incomeGrowthRate: 8,
  investmentReturnRate: 12,
};

export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
) {
  const accountTransactions = transactions.filter(
    (transaction) => transaction.account === account.name,
  );
  const income = accountTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = accountTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return account.openingBalance + income - expense;
}

function filterByMonth(transactions: Transaction[], monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + monthOffset + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return date >= start && date <= end;
  });
}

export function getMonthlySavingsRate(transactions: Transaction[]) {
  const thisMonth = filterByMonth(transactions, 0);
  const income = thisMonth
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = thisMonth
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  if (income > 0 || expense > 0) {
    return Math.max(0, income - expense);
  }

  const lastThreeMonths = [-2, -1, 0].map((offset) => {
    const month = filterByMonth(transactions, offset);
    const monthIncome = month
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const monthExpense = month
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return monthIncome - monthExpense;
  });

  const average =
    lastThreeMonths.reduce((sum, value) => sum + value, 0) /
    lastThreeMonths.length;

  return Math.max(0, Math.round(average));
}

export function getAccountsByType(accounts: Account[]) {
  return {
    bank: accounts.filter((account) => account.type === "bank"),
    cash: accounts.filter((account) => account.type === "cash"),
    wallet: accounts.filter((account) => account.type === "wallet"),
  };
}

export function computeNetWorthBreakdown(
  accounts: Account[],
  transactions: Transaction[],
  investments: Investment[],
): NetWorthBreakdown {
  let bankAccounts = 0;
  let cash = 0;
  let wallet = 0;
  let credit = 0;

  for (const account of accounts) {
    const balance = getAccountBalance(account, transactions);
    switch (account.type) {
      case "cash":
        cash += balance;
        break;
      case "wallet":
        wallet += balance;
        break;
      case "credit":
        credit += balance;
        break;
      default:
        bankAccounts += balance;
        break;
    }
  }

  const investmentTotal = investments.reduce(
    (sum, investment) => sum + investment.currentValue,
    0,
  );

  const thisMonth = filterByMonth(transactions, 0);
  const lastMonth = filterByMonth(transactions, -1);
  const thisMonthSavings =
    thisMonth
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0) -
    thisMonth
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  const lastMonthSavings =
    lastMonth
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0) -
    lastMonth
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

  // Spec §8.3 — credit accounts represent debt and are subtracted from net
  // worth, never added. `credit` here is whatever computeBalance() produced
  // for those accounts; we treat its magnitude as the amount owed regardless
  // of the sign the underlying transactions happened to net out to.
  const creditDebt = Math.abs(credit);

  return {
    total: bankAccounts + cash + wallet - creditDebt,
    bankAccounts,
    cash,
    wallet,
    investments: investmentTotal,
    monthlyChange: thisMonthSavings - lastMonthSavings,
  };
}

export type PurposeNetWorth = {
  purposeId: string;
  purposeName: string;
  color: string;
  total: number;
  monthlyChange: number;
};

export function computeNetWorthByPurpose(
  accounts: Account[],
  transactions: Transaction[],
  purposes: Purpose[],
): PurposeNetWorth[] {
  return getActivePurposes(purposes).map((purpose) => {
    const purposeTransactions = transactions.filter((transaction) =>
      transactionMatchesPurpose(transaction.purpose, purpose.id, purposes),
    );
    const scopedAccounts =
      purpose.id === PERSONAL_PURPOSE_ID
        ? accounts
        : accounts.map((account) => ({ ...account, openingBalance: 0 }));
    const breakdown = computeNetWorthBreakdown(
      scopedAccounts,
      purposeTransactions,
      [],
    );

    return {
      purposeId: purpose.id,
      purposeName: purpose.name,
      color: purpose.color ?? "#6366f1",
      total: breakdown.total,
      monthlyChange: breakdown.monthlyChange,
    };
  });
}

export function getWealthFilterLabel(
  filter: WealthFilter,
  accounts: Account[],
): string {
  if (filter.type === "all") return "All transactions";
  if (filter.type === "segment") {
    const labels = {
      bank: "Bank accounts",
      cash: "Cash",
      wallet: "Wallets",
      investments: "Investments",
    };
    return labels[filter.segment];
  }
  if (filter.type === "account") return filter.accountName;
  return filter.investmentName;
}

export function filterWealthTransactions(
  transactions: Transaction[],
  filter: WealthFilter,
  accounts: Account[],
  investments: Investment[],
): Transaction[] {
  if (filter.type === "all") return transactions;

  if (filter.type === "account") {
    return transactions.filter(
      (transaction) => transaction.account === filter.accountName,
    );
  }

  if (filter.type === "investment") {
    return transactions.filter(
      (transaction) =>
        transaction.linkedInvestmentId === filter.investmentId ||
        (isInvestmentTransaction(transaction) &&
          transaction.merchant
            .toLowerCase()
            .includes(filter.investmentName.toLowerCase())),
    );
  }

  const accountNames = new Set(
    accounts
      .filter((account) => {
        if (filter.segment === "bank") return account.type === "bank";
        if (filter.segment === "cash") return account.type === "cash";
        if (filter.segment === "wallet") return account.type === "wallet";
        return false;
      })
      .map((account) => account.name),
  );

  if (filter.segment === "investments") {
    const investmentIds = new Set(investments.map((item) => item.id));
    return transactions.filter(
      (transaction) =>
        isInvestmentTransaction(transaction) ||
        (transaction.linkedInvestmentId
          ? investmentIds.has(transaction.linkedInvestmentId)
          : false),
    );
  }

  return transactions.filter((transaction) =>
    accountNames.has(transaction.account),
  );
}

export function getTransactionBalanceAfter(
  transactions: Transaction[],
  accountName: string,
  accounts: Account[],
): Map<string, number> {
  const account = accounts.find((item) => item.name === accountName);
  const accountTransactions = transactions
    .filter((transaction) => transaction.account === accountName)
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

  const balances = new Map<string, number>();
  let running = account?.openingBalance ?? 0;

  for (const transaction of accountTransactions) {
    running +=
      transaction.type === "income"
        ? transaction.amount
        : -transaction.amount;
    balances.set(transaction.id, running);
  }

  return balances;
}

export function getNetWorthHistory(
  accounts: Account[],
  transactions: Transaction[],
  investments: Investment[],
  months = 12,
): NetWorthHistoryPoint[] {
  const points: NetWorthHistoryPoint[] = [];
  const now = new Date();

  for (let offset = -(months - 1); offset <= 0; offset += 1) {
    const end = new Date(
      now.getFullYear(),
      now.getMonth() + offset + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const scoped = transactions.filter(
      (transaction) => new Date(transaction.date) <= end,
    );

    const breakdown = computeNetWorthBreakdown(
      accounts,
      scoped,
      investments,
    );
    const month = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    const label = end.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });

    points.push({
      month,
      label,
      netWorth: breakdown.total,
    });
  }

  return points;
}

export function getEmergencyFundHealth(
  accounts: Account[],
  transactions: Transaction[],
): EmergencyFundHealth {
  const liquidAccounts = accounts.filter(
    (account) => account.type === "bank",
  );
  const liquidBalance = liquidAccounts.reduce(
    (sum, account) => sum + getAccountBalance(account, transactions),
    0,
  );

  const recentMonths = [-2, -1, 0].map((offset) => filterByMonth(transactions, offset));
  const monthlyExpenses = Math.round(
    recentMonths.reduce((sum, monthTransactions) => {
      const expense = monthTransactions
        .filter((transaction) => transaction.type === "expense")
        .reduce((total, transaction) => total + transaction.amount, 0);
      return sum + expense;
    }, 0) / Math.max(1, recentMonths.length),
  );

  const monthsCovered =
    monthlyExpenses > 0
      ? Math.round((liquidBalance / monthlyExpenses) * 10) / 10
      : 0;

  let status: EmergencyFundHealth["status"] = "low";
  let message = "Build a cash buffer covering at least 3 months of expenses.";

  if (monthsCovered >= 6) {
    status = "healthy";
    message = "Strong emergency cushion — you can handle most unexpected expenses.";
  } else if (monthsCovered >= 3) {
    status = "moderate";
    message = "Decent buffer. Aim for 6 months of expenses for full peace of mind.";
  }

  return {
    liquidBalance,
    monthlyExpenses,
    monthsCovered,
    status,
    message,
  };
}

export function getInvestmentSummary(
  investments: Investment[],
): InvestmentSummary {
  const totalInvested = investments.reduce(
    (sum, investment) => sum + investment.investedAmount,
    0,
  );
  const totalCurrentValue = investments.reduce(
    (sum, investment) => sum + investment.currentValue,
    0,
  );
  const overallReturnPercent =
    totalInvested > 0
      ? Math.round(((totalCurrentValue - totalInvested) / totalInvested) * 100)
      : 0;

  return {
    totalInvested,
    totalCurrentValue,
    overallReturnPercent,
  };
}

export function getGoalProgress(savedAmount: number, targetAmount: number) {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((savedAmount / targetAmount) * 100));
}

export function getProjectedCompletionDate(
  goal: SavingsGoal,
  monthlySavingsRate: number,
  extraMonthly = 0,
) {
  const remaining = goal.targetAmount - goal.savedAmount;
  if (remaining <= 0) return null;

  const rate = (goal.monthlyContribution ?? monthlySavingsRate) + extraMonthly;
  if (rate <= 0) return null;

  const months = Math.ceil(remaining / rate);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function getInvestmentReturns(investment: Investment) {
  if (investment.investedAmount <= 0) return 0;
  return Math.round(
    ((investment.currentValue - investment.investedAmount) /
      investment.investedAmount) *
      100,
  );
}