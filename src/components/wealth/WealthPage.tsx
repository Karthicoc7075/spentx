"use client";

import { useMemo, useState } from "react";
import { QuickAccountTransfer } from "@/components/wealth/QuickAccountTransfer";
import { WealthNetWorthIndicator } from "@/components/wealth/WealthNetWorthIndicator";
import { WealthSegmentCards } from "@/components/wealth/WealthSegmentCards";
import { DailySnapshotCard } from "@/components/wealth/DailySnapshotCard";
import { useDailySnapshot } from "@/hooks/useDailySnapshot";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  computeNetWorthBreakdown,
  computeNetWorthByPurpose,
} from "@/lib/wealth";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { useOutings } from "@/hooks/useOutings";
import { buildTransactionsListRows } from "@/lib/outings";
import type { WealthFilter } from "@/types";

export function WealthPage() {
  const { notify } = useToast();
  const { purposes } = usePurposes();
  const {
    transactions: rawTransactions,
    addTransaction,
    error: transactionsError,
  } = useTransactions();
  const { expenses: outingExpenses } = useAllOutingExpenses();
  const { outings } = useOutings();
  const { accounts, isLoading: accountsLoading } = useAccounts();

  const [filter, setFilter] = useState<WealthFilter>({ type: "all" });
  const [netWorthView, setNetWorthView] = useState<"combined" | "by-purpose">(
    "combined",
  );

  const transactions = useMemo(
    () => buildTransactionsListRows(rawTransactions, outingExpenses, outings),
    [rawTransactions, outingExpenses, outings],
  );

  // Spec §8.3 — net worth only counts active accounts; archived accounts
  // are excluded (they're soft-deleted, not gone, so their transactions
  // still exist, but their balance shouldn't count toward net worth).
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive !== false),
    [accounts],
  );

  const unlinkedOutingExpenses = useMemo(
    () =>
      outingExpenses.filter(
        (e) => !e.linkedTransactionId && e.source !== "bank-detected",
      ),
    [outingExpenses],
  );

  const netWorthBreakdown = useMemo(
    () =>
      computeNetWorthBreakdown(
        activeAccounts,
        transactions,
        unlinkedOutingExpenses,
      ),
    [activeAccounts, transactions, unlinkedOutingExpenses],
  );

  const purposeBreakdown = useMemo(
    () =>
      computeNetWorthByPurpose(
        activeAccounts,
        transactions,
        purposes,
        unlinkedOutingExpenses,
      ),
    [activeAccounts, transactions, purposes, unlinkedOutingExpenses],
  );

  const isLoading = accountsLoading && accounts.length === 0;

  const dailySnapshot = useDailySnapshot({
    accounts: activeAccounts,
    transactions,
    unlinkedOutingExpenses,
  });

  async function handleTransfer({
    fromAccount,
    toAccount,
    amount,
    date,
  }: {
    fromAccount: string;
    toAccount: string;
    amount: number;
    date: string;
  }) {
    try {
      // Same encoding as Flutter: category Settlements + tags transfer /
      // transfer_to so both clients detect transfers without double-counting.
      const transferTags = ["transfer", `transfer_to:${toAccount}`];
      await addTransaction({
        type: "expense",
        amount,
        totalAmount: amount,
        merchant: `Transfer to ${toAccount}`,
        category: "Settlements",
        account: fromAccount,
        purpose: "personal",
        source: "manual",
        date: new Date(date).toISOString(),
        note: `Internal transfer to ${toAccount}`,
        tags: transferTags,
        paymentMethod: "UPI",
      });

      await addTransaction({
        type: "income",
        amount,
        totalAmount: amount,
        merchant: `Transfer from ${fromAccount}`,
        category: "Settlements",
        account: toAccount,
        purpose: "personal",
        source: "manual",
        date: new Date(date).toISOString(),
        note: `Internal transfer from ${fromAccount}`,
        tags: transferTags,
        paymentMethod: "UPI",
      });

      notify({
        title: "Transfer recorded",
        description: `${formatCurrency(amount)} moved from ${fromAccount} to ${toAccount}.`,
      });
    } catch (transferError) {
      notify({
        title: "Couldn't record transfer",
        description:
          transferError instanceof Error ? transferError.message : "Try again.",
        variant: "destructive",
      });
      throw transferError;
    }
  }

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Wealth</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your available money across bank accounts and cash.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickAccountTransfer accounts={accounts} onTransfer={handleTransfer} />
        </div>
      </div>

      {transactionsError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Something went wrong loading wealth data. Try refreshing the page.
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-36" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <WealthNetWorthIndicator
            breakdown={netWorthBreakdown}
            isLoading={isLoading}
            purposeBreakdown={purposeBreakdown}
            view={netWorthView}
            onViewChange={setNetWorthView}
          />

          <WealthSegmentCards
            accounts={accounts}
            activeFilter={filter}
            breakdown={netWorthBreakdown}
            onFilter={setFilter}
          />

          <DailySnapshotCard accounts={activeAccounts} snapshot={dailySnapshot} />
        </>
      )}
    </div>
  );
}
