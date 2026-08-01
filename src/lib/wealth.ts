import { getActivePurposes, isPersonalPurposeRef } from "@/lib/purposes";
import { isOutingRollupTransaction } from "@/lib/outings";
import { narrowTransactionsToFilter } from "@/lib/utils";
import type {
  Account,
  EmergencyFundHealth,
  NetWorthBreakdown,
  NetWorthHistoryPoint,
  OutingExpense,
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

// Reserved category for the auto-recorded ledger entry that represents an
// account's opening balance. It's a normal-looking transaction (so it shows
// up in the ledger), but every balance/net-worth/analytics sum must skip it
// wherever `account.openingBalance` is already added as a seed — otherwise
// the same amount gets counted twice. Same pattern as the "Settlements"
// category for internal transfers.
export const OPENING_BALANCE_CATEGORY = "Opening Balance";

/** Single money amount on a transaction — totalAmount is canonical, amount is legacy UI alias. */
export function transactionAmount(transaction: Transaction): number {
  const value = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function isOpeningBalanceTransaction(transaction: Transaction) {
  return (
    (transaction.category ?? "").trim().toLowerCase() ===
    OPENING_BALANCE_CATEGORY.toLowerCase()
  );
}

/**
 * Ledger rows that must NOT move account balance / net worth.
 * - Opening Balance: already in account.openingBalance
 * - Outing rollup: display-only total on Transactions page (UI one-line);
 *   real money already moved via bank/manual ledger rows or unlinked cash
 *   outing expenses applied separately.
 */
export function isBalanceExcludedTransaction(transaction: Transaction) {
  if (isOpeningBalanceTransaction(transaction)) return true;
  return false;
}

export function buildOpeningBalanceTransaction(account: Account) {
  return {
    type: "income" as const,
    amount: account.openingBalance,
    totalAmount: account.openingBalance,
    merchant: account.name,
    category: OPENING_BALANCE_CATEGORY,
    account: account.name,
    accountId: account.id,
    purpose: "personal",
    source: "manual" as const,
    date: new Date(
      account.openingBalanceDate ?? account.createdAt ?? new Date().toISOString(),
    ).toISOString(),
    note: "Opening balance",
  };
}

export function transactionsForBalance(transactions: Transaction[]) {
  return transactions.filter((tx) => !isBalanceExcludedTransaction(tx));
}

/** Match ledger row → account by id first, then case-insensitive name. */
export function transactionMatchesAccount(
  transaction: Transaction,
  account: Account,
) {
  const accountId = (transaction.accountId ?? "").trim().toLowerCase();
  if (account.id && accountId && accountId === account.id.trim().toLowerCase()) {
    return true;
  }
  const txName = (transaction.accountName ?? transaction.account ?? "")
    .trim()
    .toLowerCase();
  return Boolean(txName) && txName === account.name.trim().toLowerCase();
}

/**
 * Unlinked outing cash (no ledger transaction) reduces Cash — same as mobile.
 */
export function unlinkedOutingCashImpact(
  account: Account,
  expenses: OutingExpense[] = [],
) {
  const target = account.name.trim().toLowerCase();
  const isCashAccount =
    account.type === "cash" || target === "cash";

  let impact = 0;
  for (const expense of expenses) {
    if (expense.linkedTransactionId) continue;
    if (expense.source === "bank-detected") continue;
    const expAcc = (expense.accountName ?? (expense as { accountId?: string }).accountId)
      ?.trim()
      .toLowerCase();
    const mode = (expense.paymentMode ?? "").trim().toLowerCase();
    // Named account match, or default unlinked manual cash → Cash account.
    const matchNamed = Boolean(expAcc) && expAcc === target;
    const matchCashDefault =
      isCashAccount &&
      (!expAcc || expAcc === "cash" || mode === "cash");
    if (matchNamed || matchCashDefault) {
      impact += Number(expense.amount) || 0;
    }
  }
  return impact;
}

/**
 * Canonical account balance (web + mobile must match):
 *   openingBalance + income − expense
 * Excludes Opening Balance rows and outing-rollup display rows.
 * Optionally subtracts unlinked outing cash (mobile parity).
 */
export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
) {
  const accountTransactions = transactionsForBalance(transactions).filter(
    (transaction) => transactionMatchesAccount(transaction, account),
  );

  const hasOutingRollup = transactions.some((t) => isOutingRollupTransaction(t) || t.tags?.includes("outing-analytics"));

  let balance = Number(account.openingBalance) || 0;
  for (const transaction of accountTransactions) {
    const amount = transactionAmount(transaction);
    if (transaction.type === "income") balance += amount;
    else balance -= amount;
  }

  if (!hasOutingRollup) {
    balance -= unlinkedOutingCashImpact(account, unlinkedOutingExpenses);
  }
  return balance;
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
    const date = new Date(transaction.transactionDate);
    return date >= start && date <= end;
  });
}

export function getMonthlySavingsRate(transactions: Transaction[]) {
  const thisMonth = filterByMonth(transactions, 0);
  const income = thisMonth
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
  const expense = thisMonth
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

  if (income > 0 || expense > 0) {
    return Math.max(0, income - expense);
  }

  const lastThreeMonths = [-2, -1, 0].map((offset) => {
    const month = filterByMonth(transactions, offset);
    const monthIncome = month
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
    const monthExpense = month
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
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

/**
 * Investments are normal transactions with an investment category
 * (category equals "Investment", "Investments", "Mutual Funds", "Stocks", "SIP" or isInvestment: true).
 */
export function computeInvestmentValue(transactions: Transaction[]): number {
  const investmentTxs = transactionsForBalance(transactions).filter((tx) => {
    const cat = (tx.category ?? "").trim().toLowerCase();
    return (
      cat === "investment" ||
      cat === "investments" ||
      cat === "stocks" ||
      cat === "mutual funds" ||
      cat === "mutual fund" ||
      cat === "sip" ||
      (tx as unknown as { isInvestment?: boolean }).isInvestment === true
    );
  });

  return investmentTxs.reduce((sum, tx) => {
    const amount = transactionAmount(tx);
    return sum + (tx.type === "expense" ? amount : -amount);
  }, 0);
}

export function computeNetWorthBreakdown(
  accounts: Account[],
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
): NetWorthBreakdown {
  let bankAccounts = 0;
  let cash = 0;
  let credit = 0;

  for (const account of accounts) {
    const balance = getAccountBalance(
      account,
      transactions,
      unlinkedOutingExpenses,
    );
    switch (account.type) {
      case "cash":
        cash += balance;
        break;
      case "credit":
        credit += balance;
        break;
      // Wallet-type accounts count toward net worth like any other
      // account — there's no dedicated "Wallets" bucket, just an account type.
      default:
        bankAccounts += balance;
        break;
    }
  }

  const investmentValue = computeInvestmentValue(transactions);

  const thisMonth = transactionsForBalance(filterByMonth(transactions, 0));
  const lastMonth = transactionsForBalance(filterByMonth(transactions, -1));
  const thisMonthSavings =
    thisMonth
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transactionAmount(transaction), 0) -
    thisMonth
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transactionAmount(transaction), 0);
  const lastMonthSavings =
    lastMonth
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transactionAmount(transaction), 0) -
    lastMonth
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transactionAmount(transaction), 0);

  // Spec §8.3 — credit accounts represent debt and are subtracted from net
  // worth, never added. `credit` here is whatever computeBalance() produced
  // for those accounts; we treat its magnitude as the amount owed regardless
  // of the sign the underlying transactions happened to net out to.
  const creditDebt = Math.abs(credit);

  return {
    total: bankAccounts + cash - creditDebt,
    bankAccounts,
    cash,
    investmentValue,
    monthlyChange: thisMonthSavings - lastMonthSavings,
  };
}

export type DailySnapshotAccountBalance = {
  accountId: string;
  accountName: string;
  accountType: Account["type"];
  balance: number;
};

export type DailySnapshotBreakdown = {
  bankBalance: number;
  cashBalance: number;
  walletBalance: number;
  investmentValue: number;
  netWorth: number;
  perAccount: DailySnapshotAccountBalance[];
};

/**
 * Per-type balance breakdown for the Daily Snapshot feature. Deliberately
 * separate from computeNetWorthBreakdown() — that function folds wallet
 * balances into `bankAccounts` (no dedicated Wallets bucket for the main
 * net-worth display), but Daily Snapshot needs wallet tracked on its own,
 * per the feature spec. Both call the same getAccountBalance() per account
 * so the numbers never drift apart.
 */
export function computeDailySnapshotBreakdown(
  accounts: Account[],
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
): DailySnapshotBreakdown {
  let bankBalance = 0;
  let cashBalance = 0;
  let walletBalance = 0;
  let credit = 0;

  const perAccount = accounts.map((account) => {
    const balance = getAccountBalance(account, transactions, unlinkedOutingExpenses);
    switch (account.type) {
      case "cash":
        cashBalance += balance;
        break;
      case "wallet":
        walletBalance += balance;
        break;
      case "credit":
        credit += balance;
        break;
      default:
        bankBalance += balance;
        break;
    }
    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      balance,
    };
  });

  const investmentValue = computeInvestmentValue(transactions);
  const creditDebt = Math.abs(credit);

  return {
    bankBalance,
    cashBalance,
    walletBalance,
    investmentValue,
    netWorth: bankBalance + cashBalance + walletBalance - creditDebt,
    perAccount,
  };
}

export type PurposeNetWorth = {
  purposeId: string;
  purposeName: string;
  color: string;
  total: number;
  bankAccounts: number;
  cash: number;
  monthlyChange: number;
};

export function computeNetWorthByPurpose(
  accounts: Account[],
  transactions: Transaction[],
  purposes: Purpose[],
  unlinkedOutingExpenses: OutingExpense[] = [],
): PurposeNetWorth[] {
  return getActivePurposes(purposes).map((purpose) => {
    // narrowTransactionsToFilter, not a plain .filter — a split expense
    // (e.g. Big Basket: ₹1,200 Personal + ₹800 Family) must count only its
    // matching split's amount toward this purpose's net worth, not the
    // whole transaction total.
    const purposeTransactions = narrowTransactionsToFilter(
      transactions,
      { purposeId: purpose.id, categories: [] },
      purposes,
    );
    const scopedAccounts = isPersonalPurposeRef(purpose.id, purposes)
      ? accounts
      : accounts.map((account) => ({ ...account, openingBalance: 0 }));
    // Unlinked outing cash only on Personal (default purpose for trip cash).
    const outingAdj = isPersonalPurposeRef(purpose.id, purposes)
      ? unlinkedOutingExpenses
      : [];
    const breakdown = computeNetWorthBreakdown(
      scopedAccounts,
      purposeTransactions,
      outingAdj,
    );

    return {
      purposeId: purpose.id,
      purposeName: purpose.name,
      color: purpose.color ?? "#6366f1",
      total: breakdown.total,
      // Surfaced per purpose so By Purpose shows the same Bank/Cash split
      // as Combined, using identical maths.
      bankAccounts: breakdown.bankAccounts,
      cash: breakdown.cash,
      monthlyChange: breakdown.monthlyChange,
    };
  });
}

export function getWealthFilterLabel(filter: WealthFilter): string {
  if (filter.type === "all") return "All transactions";
  if (filter.type === "segment") {
    const labels = {
      bank: "Bank accounts",
      cash: "Cash",
    };
    return labels[filter.segment];
  }
  return filter.accountName;
}

export function filterWealthTransactions(
  transactions: Transaction[],
  filter: WealthFilter,
  accounts: Account[],
): Transaction[] {
  if (filter.type === "all") return transactions;

  if (filter.type === "account") {
    const account = accounts.find(
      (item) =>
        item.name.trim().toLowerCase() === filter.accountName.trim().toLowerCase(),
    );
    if (!account) {
      return transactions.filter(
        (transaction) =>
          (transaction.accountName ?? transaction.account ?? "")
            .trim()
            .toLowerCase() === filter.accountName.trim().toLowerCase(),
      );
    }
    return transactions.filter((transaction) =>
      transactionMatchesAccount(transaction, account),
    );
  }

  // Wallet-type accounts fold into the "bank" segment — there's no
  // dedicated Wallets bucket to filter by.
  const scopedAccounts = accounts.filter((account) => {
    if (filter.segment === "bank") {
      return account.type === "bank" || account.type === "wallet";
    }
    if (filter.segment === "cash") return account.type === "cash";
    return false;
  });

  return transactions.filter((transaction) =>
    scopedAccounts.some((account) =>
      transactionMatchesAccount(transaction, account),
    ),
  );
}

export function getTransactionBalanceAfter(
  transactions: Transaction[],
  accountName: string,
  accounts: Account[],
): Map<string, number> {
  const account = accounts.find((item) => item.name === accountName);
  const accountTransactions = transactions
    .filter((transaction) =>
      account
        ? transactionMatchesAccount(transaction, account)
        : (transaction.accountName ?? transaction.account ?? "")
            .trim()
            .toLowerCase() === accountName.trim().toLowerCase(),
    )
    .sort(
      (a, b) =>
        new Date(a.transactionDate ?? a.date ?? 0).getTime() -
        new Date(b.transactionDate ?? b.date ?? 0).getTime(),
    );

  const balances = new Map<string, number>();
  let running = account?.openingBalance ?? 0;

  for (const transaction of accountTransactions) {
    // Opening Balance + outing-rollup display rows must not move running bal.
    if (!isBalanceExcludedTransaction(transaction)) {
      const amount = transactionAmount(transaction);
      running += transaction.type === "income" ? amount : -amount;
    }
    balances.set(transaction.id, running);
  }

  return balances;
}

export function getNetWorthHistory(
  accounts: Account[],
  transactions: Transaction[],
  months = 12,
  unlinkedOutingExpenses: OutingExpense[] = [],
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
      (transaction) =>
        new Date(transaction.transactionDate ?? transaction.date ?? 0) <= end,
    );
    // Unlinked outing cash only counts once it exists (date ≤ chart point).
    const scopedUnlinked = unlinkedOutingExpenses.filter((expense) => {
      const day = (expense.date ?? "").slice(0, 10);
      if (!day) return true;
      return new Date(`${day}T23:59:59`).getTime() <= end.getTime();
    });

    const breakdown = computeNetWorthBreakdown(
      accounts,
      scoped,
      scopedUnlinked,
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
        .reduce((total, transaction) => total + transaction.totalAmount, 0);
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

