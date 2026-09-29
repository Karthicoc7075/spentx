import { getActivePurposes, isPersonalPurposeRef } from "@/lib/purposes";
import { isOutingRollupTransaction } from "@/lib/outings";
import { narrowTransactionsToFilter } from "@/lib/utils";
import { eachDayOfInterval } from "date-fns";
import { getAccountOpeningDate } from "@/lib/accounts";
import { getTodayCalendarDate, toCalendarDate } from "@/lib/date-filters";
import type {
  Account,
  NetWorthBreakdown,
  OutingExpense,
  Purpose,
  Transaction,
  WealthFilter,
} from "@/types";

// Reserved category for the auto-recorded ledger entry that represents an
// account's opening balance.
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
 */
export function isBalanceExcludedTransaction(transaction: Transaction) {
  if (isOpeningBalanceTransaction(transaction)) return true;
  if (isOutingRollupTransaction(transaction)) return true;
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
  const isCashAccount = account.type === "cash" || target === "cash";

  let impact = 0;
  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];
    if (expense.linkedTransactionId) continue;
    if (expense.source === "bank-detected") continue;
    const expAcc = (expense.accountName ?? (expense as { accountId?: string }).accountId)
      ?.trim()
      .toLowerCase();
    const mode = (expense.paymentMode ?? "").trim().toLowerCase();
    const matchNamed = Boolean(expAcc) && expAcc === target;
    const matchCashDefault =
      isCashAccount && (!expAcc || expAcc === "cash" || mode === "cash");
    if (matchNamed || matchCashDefault) {
      impact += Number(expense.amount) || 0;
    }
  }
  return impact;
}

/**
 * High-performance single-pass balance calculator for 10,000+ transactions.
 * Computes all account balances in O(T + A) time instead of O(T * A).
 */
export function computeAccountBalancesMap(
  accounts: Account[],
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
): Map<string, number> {
  const balanceMap = new Map<string, number>();
  const accountById = new Map<string, Account>();
  const accountByName = new Map<string, Account>();

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    balanceMap.set(acc.id, Number(acc.openingBalance) || 0);
    accountById.set(acc.id.trim().toLowerCase(), acc);
    accountByName.set(acc.name.trim().toLowerCase(), acc);
  }

  const outingIdsWithIndividualTx = new Set<string>();
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.outingId && !isOutingRollupTransaction(tx)) {
      outingIdsWithIndividualTx.add(tx.outingId);
    }
  }
  const outingIdsWithUnlinked = new Set<string>(
    unlinkedOutingExpenses.map((e) => e.outingId).filter(Boolean),
  );

  const len = transactions.length;
  for (let i = 0; i < len; i++) {
    const tx = transactions[i];
    if (isOpeningBalanceTransaction(tx)) continue;
    if (isOutingRollupTransaction(tx)) {
      if (
        (tx.outingId && outingIdsWithIndividualTx.has(tx.outingId)) ||
        (tx.outingId && outingIdsWithUnlinked.has(tx.outingId))
      ) {
        continue;
      }
    }

    let targetAcc: Account | undefined;
    const txAccountId = tx.accountId?.trim().toLowerCase();
    if (txAccountId && accountById.has(txAccountId)) {
      targetAcc = accountById.get(txAccountId);
    } else {
      const txName = (tx.accountName ?? tx.account ?? "").trim().toLowerCase();
      if (txName && accountByName.has(txName)) {
        targetAcc = accountByName.get(txName);
      }
    }

    if (targetAcc) {
      const amount = transactionAmount(tx);
      const current = balanceMap.get(targetAcc.id) ?? 0;
      balanceMap.set(
        targetAcc.id,
        tx.type === "income" ? current + amount : current - amount,
      );
    }
  }

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const impact = unlinkedOutingCashImpact(acc, unlinkedOutingExpenses);
    if (impact !== 0) {
      const current = balanceMap.get(acc.id) ?? 0;
      balanceMap.set(acc.id, current - impact);
    }
  }

  return balanceMap;
}

/**
 * Canonical account balance (web + mobile match):
 * Uses fast single-account scan.
 */
export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
) {
  const accountIdLower = account.id.trim().toLowerCase();
  const accountNameLower = account.name.trim().toLowerCase();

  const outingIdsWithIndividualTx = new Set<string>();
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.outingId && !isOutingRollupTransaction(tx)) {
      outingIdsWithIndividualTx.add(tx.outingId);
    }
  }
  const outingIdsWithUnlinked = new Set<string>(
    unlinkedOutingExpenses.map((e) => e.outingId).filter(Boolean),
  );

  let balance = Number(account.openingBalance) || 0;
  const len = transactions.length;

  for (let i = 0; i < len; i++) {
    const tx = transactions[i];
    if (isOpeningBalanceTransaction(tx)) continue;
    if (isOutingRollupTransaction(tx)) {
      if (
        (tx.outingId && outingIdsWithIndividualTx.has(tx.outingId)) ||
        (tx.outingId && outingIdsWithUnlinked.has(tx.outingId))
      ) {
        continue;
      }
    }

    const txAccountId = (tx.accountId ?? "").trim().toLowerCase();
    const isIdMatch = account.id && txAccountId && txAccountId === accountIdLower;
    const isNameMatch =
      !isIdMatch &&
      (tx.accountName ?? tx.account ?? "").trim().toLowerCase() === accountNameLower;

    if (isIdMatch || isNameMatch) {
      const amount = transactionAmount(tx);
      if (tx.type === "income") balance += amount;
      else balance -= amount;
    }
  }

  balance -= unlinkedOutingCashImpact(account, unlinkedOutingExpenses);
  return balance;
}

/**
 * Investments are transactions with an investment category or isInvestment: true.
 * Optimized single-pass calculation.
 */
export function computeInvestmentValue(transactions: Transaction[]): number {
  let total = 0;
  const len = transactions.length;

  for (let i = 0; i < len; i++) {
    const tx = transactions[i];
    if (isBalanceExcludedTransaction(tx)) continue;

    const cat = (tx.category ?? "").trim().toLowerCase();
    const isInvest =
      cat === "investment" ||
      cat === "investments" ||
      cat === "stocks" ||
      cat === "mutual funds" ||
      cat === "mutual fund" ||
      cat === "sip" ||
      (tx as unknown as { isInvestment?: boolean }).isInvestment === true;

    if (isInvest) {
      const amount = transactionAmount(tx);
      total += tx.type === "expense" ? amount : -amount;
    }
  }

  return total;
}

/**
 * Computes net worth breakdown in a single pass over accounts and transactions.
 * Easily handles 10,000+ transactions with zero UI stutter.
 */
export function computeNetWorthBreakdown(
  accounts: Account[],
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
): NetWorthBreakdown {
  const balanceMap = computeAccountBalancesMap(
    accounts,
    transactions,
    unlinkedOutingExpenses,
  );

  let bankAccounts = 0;
  let wallets = 0;
  let cash = 0;
  let credit = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const balance = balanceMap.get(account.id) ?? 0;
    switch (account.type) {
      case "cash":
        cash += balance;
        break;
      case "wallet":
        wallets += balance;
        break;
      case "credit":
        credit += balance;
        break;
      default:
        bankAccounts += balance;
        break;
    }
  }

  const investmentValue = computeInvestmentValue(transactions);

  // Calculate monthly savings rate (this month vs last month)
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const endThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();

  let thisMonthSavings = 0;
  let lastMonthSavings = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (isBalanceExcludedTransaction(tx)) continue;

    const txTime = new Date(tx.transactionDate ?? tx.date ?? 0).getTime();
    const amount = transactionAmount(tx);
    const delta = tx.type === "income" ? amount : -amount;

    if (txTime >= startThisMonth && txTime <= endThisMonth) {
      thisMonthSavings += delta;
    } else if (txTime >= startLastMonth && txTime <= endLastMonth) {
      lastMonthSavings += delta;
    }
  }

  const creditDebt = Math.abs(credit);

  return {
    total: bankAccounts + wallets + cash - creditDebt,
    bankAccounts,
    wallets,
    cash,
    investmentValue,
    monthlyChange: thisMonthSavings - lastMonthSavings,
  };
}

export type DailyAccountBalance = {
  accountId: string;
  accountName: string;
  accountType: Account["type"];
  balance: number;
};

export type DailyFinancialSnapshot = {
  date: string; // "YYYY-MM-DD"
  formattedDate: string; // e.g. "28 Sep 2026"
  accountBalances: DailyAccountBalance[];
  totalBalance: number;
  netChange: number;
};

export function formatSnapshotDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatNetChange(delta: number): string {
  const rounded = Math.round(delta);
  if (Math.abs(rounded) === 0) return "₹0";
  if (rounded > 0) return `+₹${Math.abs(rounded).toLocaleString("en-IN")}`;
  return `-₹${Math.abs(rounded).toLocaleString("en-IN")}`;
}

/**
 * Optimized historical daily snapshots computation.
 * Pre-indexes transactions and computes daily snapshots backwards in O(T + Days) time.
 */
export function computeDailyFinancialSnapshots(
  accounts: Account[],
  transactions: Transaction[],
  unlinkedOutingExpenses: OutingExpense[] = [],
  options?: {
    daysLimit?: number;
    startDate?: string;
    endDate?: string;
  },
): DailyFinancialSnapshot[] {
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  if (activeAccounts.length === 0) return [];

  const validTransactions = transactionsForBalance(transactions);
  const todayStr = getTodayCalendarDate();

  let earliestDate = todayStr;
  let latestDate = todayStr;

  const accountOpeningDates = new Map<string, string>();
  for (let i = 0; i < activeAccounts.length; i++) {
    const acc = activeAccounts[i];
    const openingDate = getAccountOpeningDate(acc, validTransactions) || todayStr;
    accountOpeningDates.set(acc.id, openingDate);
    if (openingDate < earliestDate) earliestDate = openingDate;
  }

  // Pre-index accounts for O(1) lookup
  const accountById = new Map<string, Account>();
  const accountByName = new Map<string, Account>();
  for (let i = 0; i < activeAccounts.length; i++) {
    const acc = activeAccounts[i];
    accountById.set(acc.id.trim().toLowerCase(), acc);
    accountByName.set(acc.name.trim().toLowerCase(), acc);
  }

  // Map: date -> Map<accountId, netDelta>
  const dailyDeltasByDate = new Map<string, Map<string, number>>();

  for (let i = 0; i < validTransactions.length; i++) {
    const tx = validTransactions[i];
    const d = toCalendarDate(tx.transactionDate ?? tx.date ?? "");
    if (!d) continue;

    if (d < earliestDate) earliestDate = d;
    if (d > latestDate) latestDate = d;

    let targetAcc: Account | undefined;
    const txAccountId = tx.accountId?.trim().toLowerCase();
    if (txAccountId && accountById.has(txAccountId)) {
      targetAcc = accountById.get(txAccountId);
    } else {
      const txName = (tx.accountName ?? tx.account ?? "").trim().toLowerCase();
      if (txName && accountByName.has(txName)) {
        targetAcc = accountByName.get(txName);
      }
    }

    if (targetAcc) {
      const amount = transactionAmount(tx);
      const delta = tx.type === "income" ? amount : -amount;

      let accMap = dailyDeltasByDate.get(d);
      if (!accMap) {
        accMap = new Map();
        dailyDeltasByDate.set(d, accMap);
      }
      accMap.set(targetAcc.id, (accMap.get(targetAcc.id) ?? 0) + delta);
    }
  }

  // Unlinked outing cash impact
  for (let i = 0; i < unlinkedOutingExpenses.length; i++) {
    const expense = unlinkedOutingExpenses[i];
    if (expense.linkedTransactionId || expense.source === "bank-detected") continue;
    const d = toCalendarDate(expense.date);
    if (!d) continue;
    const amt = Number(expense.amount) || 0;

    for (let j = 0; j < activeAccounts.length; j++) {
      const acc = activeAccounts[j];
      const isCash = acc.type === "cash" || acc.name.trim().toLowerCase() === "cash";
      const expAcc = (expense.accountName ?? (expense as { accountId?: string }).accountId)
        ?.trim()
        .toLowerCase();
      const mode = (expense.paymentMode ?? "").trim().toLowerCase();
      const target = acc.name.trim().toLowerCase();
      const matchNamed = Boolean(expAcc) && expAcc === target;
      const matchCashDefault = isCash && (!expAcc || expAcc === "cash" || mode === "cash");

      if (matchNamed || matchCashDefault) {
        let accMap = dailyDeltasByDate.get(d);
        if (!accMap) {
          accMap = new Map();
          dailyDeltasByDate.set(d, accMap);
        }
        accMap.set(acc.id, (accMap.get(acc.id) ?? 0) - amt);
        break;
      }
    }
  }

  let startDate = options?.startDate || earliestDate;
  if (startDate > todayStr) startDate = todayStr;
  const endDate = options?.endDate || latestDate;

  const days = eachDayOfInterval({
    start: new Date(`${startDate}T12:00:00`),
    end: new Date(`${endDate}T12:00:00`),
  });

  // Current live balances using single-pass map
  const liveBalances = computeAccountBalancesMap(
    activeAccounts,
    validTransactions,
    unlinkedOutingExpenses,
  );
  const runningBalances = new Map<string, number>(liveBalances);

  const sortedDateStrings = days.map((day) => toCalendarDate(day)).reverse();
  const snapshots: DailyFinancialSnapshot[] = [];

  for (let i = 0; i < sortedDateStrings.length; i++) {
    const dateStr = sortedDateStrings[i];
    const formattedDate = formatSnapshotDate(dateStr);

    const accountsOnThisDate: DailyAccountBalance[] = [];
    let totalBalance = 0;

    for (let j = 0; j < activeAccounts.length; j++) {
      const acc = activeAccounts[j];
      const openDate = accountOpeningDates.get(acc.id) || todayStr;
      if (dateStr >= openDate) {
        const bal = runningBalances.get(acc.id) ?? 0;
        const rounded = Math.round(bal);
        totalBalance += rounded;
        accountsOnThisDate.push({
          accountId: acc.id,
          accountName: acc.name,
          accountType: acc.type,
          balance: rounded,
        });
      }
    }

    snapshots.push({
      date: dateStr,
      formattedDate,
      accountBalances: accountsOnThisDate,
      totalBalance: Math.round(totalBalance),
      netChange: 0,
    });

    const dayDeltas = dailyDeltasByDate.get(dateStr);
    if (dayDeltas) {
      for (const [accId, delta] of dayDeltas.entries()) {
        runningBalances.set(accId, (runningBalances.get(accId) ?? 0) - delta);
      }
    }
  }

  const activeSnapshots = snapshots.filter((snap) => snap.accountBalances.length > 0);

  for (let i = 0; i < activeSnapshots.length; i++) {
    if (i < activeSnapshots.length - 1) {
      activeSnapshots[i].netChange = Math.round(
        activeSnapshots[i].totalBalance - activeSnapshots[i + 1].totalBalance,
      );
    } else {
      const dateStr = activeSnapshots[i].date;
      const dayDeltas = dailyDeltasByDate.get(dateStr);
      let earliestNet = 0;
      if (dayDeltas) {
        for (const [accId, delta] of dayDeltas.entries()) {
          const openDate = accountOpeningDates.get(accId) || todayStr;
          if (dateStr >= openDate) {
            earliestNet += delta;
          }
        }
      }
      activeSnapshots[i].netChange = Math.round(earliestNet);
    }
  }

  if (options?.daysLimit && options.daysLimit > 0) {
    return activeSnapshots.slice(0, options.daysLimit);
  }

  return activeSnapshots;
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
    const purposeTransactions = narrowTransactionsToFilter(
      transactions,
      { purposeId: purpose.id, categories: [] },
      purposes,
    );
    const scopedAccounts = isPersonalPurposeRef(purpose.id, purposes)
      ? accounts
      : accounts.map((account) => ({ ...account, openingBalance: 0 }));
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
      bankAccounts: breakdown.bankAccounts,
      cash: breakdown.cash,
      monthlyChange: breakdown.monthlyChange,
    };
  });
}

export function getWealthFilterLabel(filter: WealthFilter): string {
  if (filter.type === "all") return "All transactions";
  if (filter.type === "segment") {
    const labels: Record<string, string> = {
      bank: "Bank accounts",
      wallet: "Digital Wallets",
      cash: "Cash",
      investment: "Investments",
    };
    return labels[filter.segment] ?? filter.segment;
  }
  return filter.accountName;
}

/**
 * Filter transactions for wealth view with fast Set lookup.
 */
export function filterWealthTransactions(
  transactions: Transaction[],
  filter: WealthFilter,
  accounts: Account[],
): Transaction[] {
  if (filter.type === "all") return transactions;

  if (filter.type === "account") {
    const targetName = filter.accountName.trim().toLowerCase();
    const account = accounts.find(
      (item) => item.name.trim().toLowerCase() === targetName,
    );
    const targetId = account?.id.trim().toLowerCase();

    return transactions.filter((tx) => {
      const txAccId = (tx.accountId ?? "").trim().toLowerCase();
      if (targetId && txAccId && txAccId === targetId) return true;
      const txName = (tx.accountName ?? tx.account ?? "").trim().toLowerCase();
      return Boolean(txName) && txName === targetName;
    });
  }

  // Pre-collect matching account IDs and lowercased names into Sets for O(1) membership testing
  const validIds = new Set<string>();
  const validNames = new Set<string>();

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    let match = false;
    if (filter.segment === "bank") match = acc.type === "bank";
    else if (filter.segment === "wallet") match = acc.type === "wallet";
    else if (filter.segment === "cash") match = acc.type === "cash";
    else if (filter.segment === "investment") {
      match =
        acc.type === "investment" ||
        acc.type === "mutual_fund" ||
        acc.type === "stocks";
    }

    if (match) {
      if (acc.id) validIds.add(acc.id.trim().toLowerCase());
      if (acc.name) validNames.add(acc.name.trim().toLowerCase());
    }
  }

  return transactions.filter((tx) => {
    const txAccId = (tx.accountId ?? "").trim().toLowerCase();
    if (txAccId && validIds.has(txAccId)) return true;
    const txName = (tx.accountName ?? tx.account ?? "").trim().toLowerCase();
    return Boolean(txName) && validNames.has(txName);
  });
}

/**
 * Pre-computes running balance for an account with fast sorting and O(1) map generation.
 */
export function getTransactionBalanceAfter(
  transactions: Transaction[],
  accountName: string,
  accounts: Account[],
): Map<string, number> {
  const targetName = accountName.trim().toLowerCase();
  const account = accounts.find((item) => item.name.trim().toLowerCase() === targetName);
  const targetId = account?.id.trim().toLowerCase();

  const accountTransactions: Transaction[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const txAccId = (tx.accountId ?? "").trim().toLowerCase();
    const isIdMatch = Boolean(targetId && txAccId && txAccId === targetId);
    const isNameMatch =
      !isIdMatch && (tx.accountName ?? tx.account ?? "").trim().toLowerCase() === targetName;

    if (isIdMatch || isNameMatch) {
      accountTransactions.push(tx);
    }
  }

  // Fast chronological sort using direct string comparison on date keys
  accountTransactions.sort((a, b) => {
    const aKey = a.transactionDate || a.date || "";
    const bKey = b.transactionDate || b.date || "";
    return aKey > bKey ? 1 : aKey < bKey ? -1 : 0;
  });

  const balances = new Map<string, number>();
  let running = account?.openingBalance ?? 0;

  for (let i = 0; i < accountTransactions.length; i++) {
    const tx = accountTransactions[i];
    if (!isBalanceExcludedTransaction(tx)) {
      const amount = transactionAmount(tx);
      running += tx.type === "income" ? amount : -amount;
    }
    balances.set(tx.id, running);
  }

  return balances;
}
