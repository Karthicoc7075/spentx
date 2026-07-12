"use client";

import { useMemo, useState } from "react";
import { BalanceSnapshotPanel } from "@/components/wealth/BalanceSnapshotPanel";
import { InvestmentSummaryCard } from "@/components/wealth/InvestmentSummaryCard";
import { InvestmentsTable } from "@/components/wealth/InvestmentsTable";
import { LogSnapshotModal } from "@/components/wealth/LogSnapshotModal";
import { NetWorthHistoryChart } from "@/components/wealth/NetWorthHistoryChart";
import { QuickAccountTransfer } from "@/components/wealth/QuickAccountTransfer";
import { WealthFilteredTransactions } from "@/components/wealth/WealthFilteredTransactions";
import { WealthNetWorthIndicator } from "@/components/wealth/WealthNetWorthIndicator";
import { WealthSegmentCards } from "@/components/wealth/WealthSegmentCards";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestments } from "@/hooks/useInvestments";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  computeNetWorthBreakdown,
  computeNetWorthByPurpose,
  getInvestmentSummary,
  getNetWorthHistory,
} from "@/lib/wealth";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { WealthFilter } from "@/types";

export function WealthPage() {
  const { notify } = useToast();
  const { purposes } = usePurposes();
  const {
    transactions,
    addTransaction,
    error: transactionsError,
  } = useTransactions();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const {
    investments,
    isLoading: investmentsLoading,
    addInvestment,
    updateInvestment,
    removeInvestment,
  } = useInvestments();

  const [filter, setFilter] = useState<WealthFilter>({ type: "all" });
  const [netWorthView, setNetWorthView] = useState<"combined" | "by-purpose">(
    "combined",
  );

  // Spec §8.3 — net worth only counts active accounts; archived accounts
  // are excluded (they're soft-deleted, not gone, so their transactions
  // still exist, but their balance shouldn't count toward net worth).
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.is_active !== false),
    [accounts],
  );

  const netWorthBreakdown = useMemo(
    () => computeNetWorthBreakdown(activeAccounts, transactions, investments),
    [activeAccounts, transactions, investments],
  );

  const purposeBreakdown = useMemo(
    () => computeNetWorthByPurpose(activeAccounts, transactions, purposes),
    [activeAccounts, transactions, purposes],
  );

  const netWorthHistory = useMemo(
    () => getNetWorthHistory(activeAccounts, transactions, investments, 12),
    [activeAccounts, transactions, investments],
  );

  const investmentSummary = useMemo(
    () => getInvestmentSummary(investments),
    [investments],
  );

  const isLoading =
    (accountsLoading && accounts.length === 0) ||
    (investmentsLoading && investments.length === 0);

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
    await addTransaction({
      type: "expense",
      amount,
      merchant: `Transfer to ${toAccount}`,
      category: "Settlements",
      account: fromAccount,
      purpose: "personal",
      source: "manual",
      date: new Date(date).toISOString(),
      note: `Internal transfer to ${toAccount}`,
    });

    await addTransaction({
      type: "income",
      amount,
      merchant: `Transfer from ${fromAccount}`,
      category: "Settlements",
      account: toAccount,
      purpose: "personal",
      source: "manual",
      date: new Date(date).toISOString(),
      note: `Internal transfer from ${fromAccount}`,
    });

    notify({
      title: "Transfer recorded",
      description: `${formatCurrency(amount)} moved from ${fromAccount} to ${toAccount}.`,
    });
  }

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Wealth</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify what you own against what the app computes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LogSnapshotModal transactions={transactions} />
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
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
            investmentCount={investments.length}
            onFilter={setFilter}
          />

          <BalanceSnapshotPanel accounts={accounts} transactions={transactions} />

          <NetWorthHistoryChart data={netWorthHistory} />

          <InvestmentSummaryCard summary={investmentSummary} />

          <InvestmentsTable
            investments={investments}
            isLoading={investmentsLoading}
            onAdd={addInvestment}
            onDelete={removeInvestment}
            onUpdate={updateInvestment}
          />

          <WealthFilteredTransactions
            accounts={accounts}
            filter={filter}
            investments={investments}
            transactions={transactions}
            onClearFilter={() => setFilter({ type: "all" })}
          />
        </>
      )}
    </div>
  );
}