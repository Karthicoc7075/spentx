"use client";

import { useMemo, useState } from "react";
import { QuickAccountTransfer } from "@/components/wealth/QuickAccountTransfer";
import { WealthNetWorthIndicator } from "@/components/wealth/WealthNetWorthIndicator";
import { WealthSegmentCards } from "@/components/wealth/WealthSegmentCards";
import { WealthAccountsList } from "@/components/wealth/WealthAccountsList";
import { DailySnapshotHistoryModal } from "@/components/wealth/DailySnapshotHistoryModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarClock, Landmark, Plus, Target, TrendingUp } from "lucide-react";
import { NewAccountModal } from "@/components/wealth/NewAccountModal";
import { NewSavingsGoalModal } from "@/components/wealth/NewSavingsGoalModal";
import { NewInvestmentModal } from "@/components/wealth/NewInvestmentModal";
import { SavingsGoalsSection } from "@/components/wealth/SavingsGoalsSection";
import { InvestmentsSection } from "@/components/wealth/InvestmentsSection";
import { useAccounts } from "@/hooks/useAccounts";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  computeDailyFinancialSnapshots,
  computeNetWorthBreakdown,
  computeNetWorthByPurpose,
} from "@/lib/wealth";
import { cn, formatCurrency } from "@/lib/utils";
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
  const { goals: savingsGoals = [] } = useSavingsGoals();

  // Tab state: "accounts" | "goals" | "investments"
  const [activeTab, setActiveTab] = useState<"accounts" | "goals" | "investments">("accounts");

  // Default active segment is "bank" as requested
  const [filter, setFilter] = useState<WealthFilter>({
    type: "segment",
    segment: "bank",
  });
  const [netWorthView, setNetWorthView] = useState<"combined" | "by-purpose">(
    "combined",
  );
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [newInvestmentOpen, setNewInvestmentOpen] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromAccount, setTransferFromAccount] = useState<string | undefined>();

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

  const investmentAccounts = useMemo(
    () =>
      activeAccounts.filter(
        (a) =>
          a.type === "investment" ||
          a.type === "mutual_fund" ||
          a.type === "stocks",
      ),
    [activeAccounts],
  );

  const activeGoalsCount = useMemo(
    () => savingsGoals.filter((g) => g.isActive !== false && !g.deletedAt).length,
    [savingsGoals],
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

  // Lazily compute purpose breakdown only when user switches to "by-purpose" view
  const purposeBreakdown = useMemo(() => {
    if (netWorthView !== "by-purpose") return [];
    return computeNetWorthByPurpose(
      activeAccounts,
      transactions,
      purposes,
      unlinkedOutingExpenses,
    );
  }, [netWorthView, activeAccounts, transactions, purposes, unlinkedOutingExpenses]);

  const isLoading = accountsLoading && accounts.length === 0;

  // Lazily compute historical daily snapshots only when the user opens the modal
  const dailySnapshots = useMemo(() => {
    if (!snapshotModalOpen) return [];
    return computeDailyFinancialSnapshots(
      activeAccounts,
      transactions,
      unlinkedOutingExpenses,
    );
  }, [snapshotModalOpen, activeAccounts, transactions, unlinkedOutingExpenses]);

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
    <div className="grid gap-5 sm:gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-normal">Wealth</h1>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
            Your financial health across accounts, savings goals, and portfolio investments.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full lg:w-auto">
          {activeTab === "accounts" ? (
            <>
              <Button
                onClick={() => setNewAccountOpen(true)}
                className="gap-2 font-medium rounded-xl"
              >
                <Plus className="size-4" />
                New Account
              </Button>
              <Button
                onClick={() => setSnapshotModalOpen(true)}
                variant="outline"
                className="gap-2 font-medium rounded-xl"
              >
                <CalendarClock className="size-4 text-primary" />
                Snapshot History
              </Button>
            </>
          ) : activeTab === "goals" ? (
            <Button
              onClick={() => setNewGoalOpen(true)}
              className="gap-2 font-medium col-span-2 sm:col-span-1 rounded-xl"
            >
              <Plus className="size-4" />
              New Savings Goal
            </Button>
          ) : (
            <Button
              onClick={() => setNewInvestmentOpen(true)}
              className="gap-2 font-medium col-span-2 sm:col-span-1 rounded-xl"
            >
              <Plus className="size-4" />
              Add Investment
            </Button>
          )}

          <div className="col-span-2 sm:col-span-1 w-full sm:w-auto">
            <QuickAccountTransfer
              accounts={accounts}
              onTransfer={handleTransfer}
              open={transferModalOpen}
              onOpenChange={setTransferModalOpen}
              defaultFromAccount={transferFromAccount}
            />
          </div>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Net Worth Hero Indicator */}
          <WealthNetWorthIndicator
            breakdown={netWorthBreakdown}
            isLoading={isLoading}
            purposeBreakdown={purposeBreakdown}
            view={netWorthView}
            onViewChange={setNetWorthView}
          />

          {/* Tab Switcher Navigation */}
          <div className="flex items-center gap-1 sm:gap-2 border-b border-border/70 pb-px overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("accounts")}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer rounded-t-lg",
                activeTab === "accounts"
                  ? "border-primary text-primary bg-primary/[0.04]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Landmark className="size-4" />
              <span>Accounts & Balances</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[10px] font-semibold tabular-nums",
                  activeTab === "accounts"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {activeAccounts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("goals")}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer rounded-t-lg",
                activeTab === "goals"
                  ? "border-primary text-primary bg-primary/[0.04]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Target className="size-4" />
              <span>Savings & Goals</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[10px] font-semibold tabular-nums",
                  activeTab === "goals"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {activeGoalsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("investments")}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer rounded-t-lg",
                activeTab === "investments"
                  ? "border-primary text-primary bg-primary/[0.04]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <TrendingUp className="size-4" />
              <span>Portfolio Investments</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[10px] font-semibold tabular-nums",
                  activeTab === "investments"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {investmentAccounts.length}
              </span>
            </button>
          </div>

          {/* Tab 1: Accounts & Balances */}
          {activeTab === "accounts" ? (
            <div className="space-y-6">
              <WealthSegmentCards
                accounts={accounts}
                activeFilter={filter}
                breakdown={netWorthBreakdown}
                onFilter={setFilter}
              />

              <WealthAccountsList
                accounts={activeAccounts}
                transactions={transactions}
                unlinkedOutingExpenses={unlinkedOutingExpenses}
                activeFilter={filter}
                onFilterChange={setFilter}
                onNewAccount={() => setNewAccountOpen(true)}
                onTransfer={(accountName) => {
                  setTransferFromAccount(accountName);
                  setTransferModalOpen(true);
                }}
              />
            </div>
          ) : null}

          {/* Tab 2: Savings & Goals */}
          {activeTab === "goals" ? (
            <SavingsGoalsSection onNewGoalClick={() => setNewGoalOpen(true)} />
          ) : null}

          {/* Tab 3: Portfolio Investments */}
          {activeTab === "investments" ? (
            <InvestmentsSection
              accounts={activeAccounts}
              transactions={transactions}
              unlinkedOutingExpenses={unlinkedOutingExpenses}
              onNewInvestmentClick={() => setNewInvestmentOpen(true)}
            />
          ) : null}
        </>
      )}

      {/* Daily Snapshots Modal */}
      <DailySnapshotHistoryModal
        open={snapshotModalOpen}
        onOpenChange={setSnapshotModalOpen}
        dailySnapshots={dailySnapshots}
        accounts={activeAccounts}
        onNewAccount={() => setNewAccountOpen(true)}
      />

      {/* New Account Modal */}
      <NewAccountModal
        open={newAccountOpen}
        onOpenChange={setNewAccountOpen}
      />

      {/* New Savings Goal Modal */}
      <NewSavingsGoalModal
        open={newGoalOpen}
        onOpenChange={setNewGoalOpen}
      />

      {/* New Investment Modal */}
      <NewInvestmentModal
        open={newInvestmentOpen}
        onOpenChange={setNewInvestmentOpen}
      />
    </div>
  );
}
