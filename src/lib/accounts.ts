import { toCalendarDate } from "@/lib/date-filters";
import { transactionMatchesAccount } from "@/lib/wealth";
import type { Account, Transaction } from "@/types";

export function getAccountOpeningDate(
  account: Account,
  transactions: Transaction[] = [],
): string | null {
  const dates: string[] = [];

  if (account.openingBalanceDate) {
    dates.push(account.openingBalanceDate);
  }

  if (account.createdAt) {
    const d = toCalendarDate(account.createdAt);
    if (d) dates.push(d);
  }

  const accountTransactions = transactions
    .filter((transaction) => transactionMatchesAccount(transaction, account))
    .map((transaction) =>
      toCalendarDate(transaction.transactionDate ?? transaction.date ?? ""),
    )
    .filter((d): d is string => Boolean(d))
    .sort();

  if (accountTransactions.length > 0) {
    dates.push(accountTransactions[0]);
  }

  if (dates.length > 0) {
    dates.sort();
    return dates[0];
  }

  return null;
}

export function isAccountActiveOnDate(
  account: Account,
  asOfDate: string,
  transactions: Transaction[] = [],
) {
  const openingDate = getAccountOpeningDate(account, transactions);
  if (!openingDate) return true;
  return asOfDate >= openingDate;
}

export function getEffectiveOpeningBalance(
  account: Account,
  asOfDate: string,
  transactions: Transaction[] = [],
) {
  if (!isAccountActiveOnDate(account, asOfDate, transactions)) {
    return 0;
  }
  return account.openingBalance ?? 0;
}

export function formatAccountOpeningDate(
  account: Account,
  transactions: Transaction[] = [],
) {
  const openingDate = getAccountOpeningDate(account, transactions);
  if (!openingDate) return null;
  return new Date(`${openingDate}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}