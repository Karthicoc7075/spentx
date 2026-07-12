import {
  getAccountOpeningDate,
  getEffectiveOpeningBalance,
  isAccountActiveOnDate,
} from "@/lib/accounts";
import { isOnOrBeforeCalendarDate } from "@/lib/date-filters";
import type { Account, Transaction } from "@/types";

export function computeRunningBalance(
  openingBalance: number,
  transactions: Transaction[],
) {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let balance = openingBalance;

  return sorted.map((transaction) => {
    if (transaction.type === "income") {
      balance += transaction.amount;
    } else {
      balance -= transaction.amount;
    }

    return {
      transactionId: transaction.id,
      date: transaction.date,
      balance,
    };
  });
}

export function computeClosingBalance(
  openingBalance: number,
  transactions: Transaction[],
) {
  const running = computeRunningBalance(openingBalance, transactions);
  return running.length > 0 ? running[running.length - 1].balance : openingBalance;
}

export function getTransactionsThroughDate(
  transactions: Transaction[],
  asOfDate: string,
) {
  return transactions.filter((transaction) =>
    isOnOrBeforeCalendarDate(transaction.date, asOfDate),
  );
}

export type BalanceAsOfBreakdown = {
  openingBalance: number;
  configuredOpeningBalance: number;
  incomeThroughDate: number;
  expenseThroughDate: number;
  transactionCount: number;
  excludedAfterDate: number;
  computedBalance: number;
  accountActiveOnDate: boolean;
  accountOpeningDate: string | null;
};

export function getBalanceBreakdownAsOfDate(
  account: Account,
  transactions: Transaction[],
  asOfDate: string,
): BalanceAsOfBreakdown {
  const accountActiveOnDate = isAccountActiveOnDate(account, asOfDate, transactions);
  const effectiveOpening = getEffectiveOpeningBalance(
    account,
    asOfDate,
    transactions,
  );
  const throughDate = getTransactionsThroughDate(transactions, asOfDate);
  const excludedAfterDate = transactions.length - throughDate.length;
  const incomeThroughDate = throughDate
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenseThroughDate = throughDate
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    openingBalance: effectiveOpening,
    configuredOpeningBalance: account.openingBalance ?? 0,
    incomeThroughDate,
    expenseThroughDate,
    transactionCount: throughDate.length,
    excludedAfterDate,
    computedBalance: computeClosingBalance(effectiveOpening, throughDate),
    accountActiveOnDate,
    accountOpeningDate: getAccountOpeningDate(account, transactions),
  };
}

export function computeBalanceAsOfDate(
  account: Account,
  transactions: Transaction[],
  asOfDate: string,
) {
  return getBalanceBreakdownAsOfDate(account, transactions, asOfDate)
    .computedBalance;
}