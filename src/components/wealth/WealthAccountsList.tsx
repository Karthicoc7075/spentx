"use client";

import { useMemo } from "react";
import {
  Landmark,
  Wallet,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { computeAccountBalancesMap } from "@/lib/wealth";
import { WealthFilteredTransactions } from "@/components/wealth/WealthFilteredTransactions";
import { InvestmentHistoryPanel } from "@/components/wealth/InvestmentHistoryPanel";
import type { Account, OutingExpense, Transaction, WealthFilter } from "@/types";

type WealthAccountsListProps = {
  accounts: Account[];
  transactions: Transaction[];
  unlinkedOutingExpenses?: OutingExpense[];
  activeFilter: WealthFilter;
  onFilterChange: (filter: WealthFilter) => void;
  onNewAccount?: () => void;
  onTransfer?: (fromAccountName?: string) => void;
};

export function WealthAccountsList({
  accounts,
  transactions,
  unlinkedOutingExpenses = [],
  activeFilter,
  onFilterChange,
  onNewAccount,
  onTransfer,
}: WealthAccountsListProps) {
  // Compute live balances for all accounts in a single pass O(N)
  const accountsWithBalances = useMemo(() => {
    const balances = computeAccountBalancesMap(
      accounts,
      transactions,
      unlinkedOutingExpenses,
    );
    return accounts.map((account) => ({
      account,
      balance: balances.get(account.id) ?? 0,
    }));
  }, [accounts, transactions, unlinkedOutingExpenses]);

  // Determine active segment (defaults to "bank")
  const activeSegmentKey = useMemo(() => {
    if (activeFilter.type === "segment") {
      return activeFilter.segment;
    }
    if (activeFilter.type === "account") {
      const match = accounts.find(
        (a) =>
          a.name.trim().toLowerCase() ===
          activeFilter.accountName.trim().toLowerCase(),
      );
      if (match?.type === "bank") return "bank";
      if (match?.type === "wallet") return "wallet";
      if (match?.type === "cash") return "cash";
      if (
        match?.type === "investment" ||
        match?.type === "mutual_fund" ||
        match?.type === "stocks"
      ) {
        return "investment";
      }
      return "bank";
    }
    return "bank";
  }, [accounts, activeFilter]);

  const selectedAccountName =
    activeFilter.type === "account" ? activeFilter.accountName : null;

  // Filter accounts belonging to the active segment (Bank or Wallet)
  const segmentAccounts = useMemo(() => {
    if (activeSegmentKey === "bank") {
      return accountsWithBalances.filter((item) => item.account.type === "bank");
    }
    if (activeSegmentKey === "wallet") {
      return accountsWithBalances.filter((item) => item.account.type === "wallet");
    }
    return [];
  }, [accountsWithBalances, activeSegmentKey]);

  // Default-select the first account if none is explicitly selected or current selection is not in this segment
  const effectiveSelectedAccount = useMemo(() => {
    if (
      selectedAccountName &&
      segmentAccounts.some(
        (item) =>
          item.account.name.trim().toLowerCase() ===
          selectedAccountName.trim().toLowerCase(),
      )
    ) {
      return selectedAccountName;
    }
    return segmentAccounts[0]?.account.name ?? null;
  }, [selectedAccountName, segmentAccounts]);

  // 1. CASH: User specified "cash click transaction only. cash only one. not need list."
  if (activeSegmentKey === "cash") {
    return (
      <div className="space-y-4">
        <WealthFilteredTransactions
          transactions={transactions}
          accounts={accounts}
          filter={{ type: "segment", segment: "cash" }}
        />
      </div>
    );
  }

  // 2. INVESTMENT: User specified "investment . click all transaction for investment all show."
  if (activeSegmentKey === "investment") {
    return (
      <div className="space-y-4">
        <InvestmentHistoryPanel transactions={transactions} />
      </div>
    );
  }

  // 3. BANK OR WALLET: Show account list cards, and below show transaction account
  const segmentTitle =
    activeSegmentKey === "bank" ? "Bank Accounts" : "Digital Wallets";
  const SegmentIcon = activeSegmentKey === "bank" ? Landmark : Wallet;

  return (
    <div className="space-y-5">
      {/* Sub-header with account count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-xl",
              activeSegmentKey === "bank"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400",
            )}
          >
            <SegmentIcon className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <span>{segmentTitle}</span>
              <span className="text-xs font-normal text-muted-foreground">
                ({segmentAccounts.length})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Select an account to view its specific transaction history below.
            </p>
          </div>
        </div>
      </div>

      {/* Account Cards */}
      {segmentAccounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-10 px-4 text-center bg-card/50">
          <SegmentIcon className="mx-auto size-9 text-muted-foreground/40" />
          <h4 className="mt-3 text-sm font-semibold text-foreground">
            No {segmentTitle.toLowerCase()} added yet
          </h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Add your first {activeSegmentKey === "bank" ? "bank account" : "wallet"} to begin tracking its balance and transactions.
          </p>
          {onNewAccount ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-4 text-xs gap-1.5"
              onClick={onNewAccount}
            >
              <Plus className="size-3.5" />
              Add {activeSegmentKey === "bank" ? "Bank Account" : "Wallet"}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {segmentAccounts.map(({ account, balance }) => {
            const isSelected =
              effectiveSelectedAccount?.trim().toLowerCase() ===
              account.name.trim().toLowerCase();

            return (
              <div
                key={account.id}
                onClick={() => {
                  onFilterChange({
                    type: "account",
                    accountName: account.name,
                  });
                }}
                className={cn(
                  "rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs transition-all duration-200 cursor-pointer flex flex-col justify-between hover:shadow-xs group",
                  isSelected
                    ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03] shadow-xs"
                    : "border-border/80 hover:border-border",
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex size-8.5 sm:size-9 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-105",
                          activeSegmentKey === "bank"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                        )}
                      >
                        <SegmentIcon className="size-4 sm:size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-xs sm:text-sm font-bold text-foreground truncate"
                          title={account.name}
                        >
                          {account.name}
                        </h4>
                        {account.last4 ? (
                          <span className="text-[10px] sm:text-[11px] font-mono text-muted-foreground">
                            •••• {account.last4}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isSelected ? (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[9px] sm:text-[10px] font-bold shrink-0">
                        <CheckCircle2 className="size-3" />
                        Selected
                      </span>
                    ) : null}
                  </div>

                  {/* Balance Display */}
                  <div className="pt-2.5 sm:pt-3">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Current Balance
                    </span>
                    <p
                      className={cn(
                        "text-lg sm:text-xl font-bold leading-tight tracking-tight font-mono tabular-nums mt-0.5 truncate",
                        balance >= 0
                          ? "text-foreground"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {formatCurrency(balance)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transactions Table Below Accounts */}
      <div className="pt-2">
        <WealthFilteredTransactions
          transactions={transactions}
          accounts={accounts}
          filter={
            effectiveSelectedAccount
              ? { type: "account", accountName: effectiveSelectedAccount }
              : activeFilter
          }
        />
      </div>
    </div>
  );
}
