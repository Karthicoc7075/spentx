"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthReady } from "@/hooks/useAuthReady";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchNetWorthHistory,
  saveBalanceSnapshot,
  upsertNetWorthSnapshot,
  deleteNetWorthSnapshot,
} from "@/lib/supabase-data";
import {
  computeDailySnapshotBreakdown,
  transactionAmount,
  transactionMatchesAccount,
  transactionsForBalance,
} from "@/lib/wealth";
import { transactionDateKey } from "@/lib/utils";
import type { Account, NetWorthSnapshot, OutingExpense, Transaction } from "@/types";

/** UTC date-only key — matches how mobile derives month/date keys, so a
 * snapshot taken from either platform lands on the same `snapshot_date`. */
function toDateKey(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

export type SnapshotComparisonRow = {
  key: string;
  label: string;
  today: number;
  previous: number;
  delta: number;
};

export type DailySnapshotComparison = {
  netWorth: SnapshotComparisonRow;
  accounts: SnapshotComparisonRow[];
  /** Cash dropped more than today's recorded cash expenses explain. */
  missingCash: number;
};

function compareRow(key: string, label: string, today: number, previous: number): SnapshotComparisonRow {
  return { key, label, today, previous, delta: today - previous };
}

/**
 * Daily Snapshot (Wealth History) — records today's closing balance per
 * account plus total wealth, and compares against the previous day.
 * Reads/writes the existing `net_worth_history` + `account_balance_history`
 * tables (already modeled for exactly this, previously unused) rather than
 * a new schema. Never touches transaction history.
 */
export function useDailySnapshot({
  accounts,
  transactions,
  unlinkedOutingExpenses = [],
}: {
  accounts: Account[];
  transactions: Transaction[];
  unlinkedOutingExpenses?: OutingExpense[];
}) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const historyQuery = useQuery({
    queryKey: queryKeys.netWorthHistory(user?.id),
    queryFn: () => fetchNetWorthHistory(user?.id),
    enabled: Boolean(user?.id),
  });

  const breakdown = useMemo(
    () => computeDailySnapshotBreakdown(accounts, transactions, unlinkedOutingExpenses),
    [accounts, transactions, unlinkedOutingExpenses],
  );

  // Automatic snapshot creation — "first app open today" per spec, no
  // popup/confirmation. Re-upserting on every load is intentionally
  // idempotent (same day = same row) rather than a one-shot "does today
  // exist yet" check, so a same-day revisit after more transactions keeps
  // today's snapshot current.
  const lastSyncedSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || accounts.length === 0) return;
    const signature = [
      todayKey,
      breakdown.netWorth,
      breakdown.cashBalance,
      breakdown.bankBalance,
      breakdown.walletBalance,
    ].join(":");
    if (lastSyncedSignature.current === signature) return;
    lastSyncedSignature.current = signature;

    (async () => {
      await upsertNetWorthSnapshot(user.id, {
        date: todayKey,
        cashBalance: breakdown.cashBalance,
        bankBalance: breakdown.bankBalance,
        walletBalance: breakdown.walletBalance,
        investmentValue: breakdown.investmentValue,
        netWorth: breakdown.netWorth,
      });
      await Promise.all(
        breakdown.perAccount.map((account) =>
          saveBalanceSnapshot(user.id, {
            userId: user.id,
            accountId: account.accountId,
            date: todayKey,
            balance: account.balance,
          }),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.netWorthHistory(user.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.balanceSnapshots(user.id) });
    })().catch(() => {
      // Allow retry on the next render if the write failed.
      lastSyncedSignature.current = null;
    });
  }, [user?.id, accounts.length, breakdown, todayKey, queryClient]);

  const history = useMemo(
    () => [...(historyQuery.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [historyQuery.data],
  );

  const today: NetWorthSnapshot =
    history.find((row) => row.date === todayKey) ?? {
      userId: user?.id ?? "",
      date: todayKey,
      cashBalance: breakdown.cashBalance,
      bankBalance: breakdown.bankBalance,
      walletBalance: breakdown.walletBalance,
      investmentValue: breakdown.investmentValue,
      netWorth: breakdown.netWorth,
    };

  const yesterday = history.find((row) => row.date < todayKey);

  const comparison: DailySnapshotComparison | null = useMemo(() => {
    if (!yesterday) return null;

    const cashDrop = yesterday.cashBalance - today.cashBalance;
    const cashAccountNames = new Set(
      accounts.filter((a) => a.type === "cash").map((a) => a.name.toLowerCase()),
    );
    const recordedCashExpenseToday = transactionsForBalance(transactions)
      .filter(
        (t) =>
          t.type === "expense" &&
          toDateKey(transactionDateKey(t)) === todayKey &&
          cashAccountNames.has((t.accountName ?? t.account ?? "").toLowerCase()),
      )
      .reduce((sum, t) => sum + transactionAmount(t), 0);
    const missingCash =
      cashDrop > 0 ? Math.max(0, cashDrop - recordedCashExpenseToday) : 0;

    return {
      netWorth: compareRow("netWorth", "Net Worth", today.netWorth, yesterday.netWorth),
      accounts: [
        compareRow("bank", "Bank", today.bankBalance, yesterday.bankBalance),
        compareRow("cash", "Cash", today.cashBalance, yesterday.cashBalance),
        compareRow("wallet", "Wallet", today.walletBalance, yesterday.walletBalance),
      ],
      missingCash,
    };
  }, [yesterday, today, accounts, transactions, todayKey]);

  async function removeSnapshot(id: string) {
    await deleteNetWorthSnapshot(id);
    if (user?.id) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.netWorthHistory(user.id) });
    }
  }

  return {
    today,
    yesterday,
    history,
    perAccount: breakdown.perAccount,
    comparison,
    isLoading: historyQuery.isLoading,
    removeSnapshot,
  };
}

export function accountBalanceOn(
  snapshotAccounts: { accountId: string; balance: number }[],
  accountId: string,
) {
  return snapshotAccounts.find((row) => row.accountId === accountId)?.balance ?? 0;
}
