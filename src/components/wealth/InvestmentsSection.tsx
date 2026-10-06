"use client";

import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building,
  Coins,
  Edit2,
  Gem,
  Landmark,
  LineChart,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { computeAccountBalancesMap } from "@/lib/wealth";
import { InvestmentHistoryPanel } from "@/components/wealth/InvestmentHistoryPanel";
import { NewInvestmentModal } from "@/components/wealth/NewInvestmentModal";
import { useAuthReady } from "@/hooks/useAuthReady";
import { deleteAccount } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/providers/toast-provider";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import type { Account, OutingExpense, Transaction } from "@/types";

type InvestmentsSectionProps = {
  accounts: Account[];
  transactions: Transaction[];
  unlinkedOutingExpenses?: OutingExpense[];
  onNewInvestmentClick?: () => void;
};

export function InvestmentsSection({
  accounts,
  transactions,
  unlinkedOutingExpenses = [],
  onNewInvestmentClick,
}: InvestmentsSectionProps) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Compute live balances for all accounts
  const balances = useMemo(
    () => computeAccountBalancesMap(accounts, transactions, unlinkedOutingExpenses),
    [accounts, transactions, unlinkedOutingExpenses],
  );

  // Filter accounts belonging to investment types
  const investmentAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.isActive !== false &&
          (a.type === "investment" ||
            a.type === "mutual_fund" ||
            a.type === "stocks"),
      ),
    [accounts],
  );

  // Calculate total capital invested across accounts
  const totalInvestedInAccounts = useMemo(
    () =>
      investmentAccounts.reduce((sum, a) => {
        const bal = balances.get(a.id) ?? a.openingBalance ?? 0;
        return sum + Math.max(0, bal);
      }, 0),
    [investmentAccounts, balances],
  );

  async function handleDelete(acc: Account) {
    if (!confirm(`Delete investment holding "${acc.name}"?`)) return;
    try {
      await deleteAccount(user?.id, acc.id);
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(user.id) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.investmentTotal(user.id) });
        await invalidateFinancialData(queryClient, user.id);
      }
      notify({
        title: "Investment deleted",
        description: `"${acc.name}" was removed from your portfolio.`,
      });
    } catch {
      notify({
        title: "Could not delete",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Investment Overview Banner (Parity with Mobile reference) */}
      <div className="sx-surface rounded-2xl p-4 sm:p-5 border bg-card/60 backdrop-blur">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <TrendingUp className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                TOTAL CAPITAL INVESTED
              </span>
              <span className="rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[10px] font-semibold">
                ● Portfolio
              </span>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {formatCurrency(totalInvestedInAccounts)}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                across {investmentAccounts.length} asset accounts
              </span>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              Capital deployed directly into mutual funds, equities, fixed deposits, and precious metals.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <Button
              onClick={() => {
                setEditingAccount(null);
                if (onNewInvestmentClick) onNewInvestmentClick();
                else setModalOpen(true);
              }}
              size="sm"
              className="gap-1.5 font-medium rounded-xl"
            >
              <Plus className="size-4" />
              Add Investment
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Holdings & Assets Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <span>Portfolio Holdings</span>
            <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
              {investmentAccounts.length}
            </span>
          </h3>
        </div>

        {investmentAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-10 px-4 text-center bg-card/40">
            <BriefcaseBusiness className="mx-auto size-9 text-muted-foreground/40" />
            <h4 className="mt-3 text-sm font-semibold text-foreground">
              No investment accounts added yet
            </h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Add mutual funds, demat accounts, or fixed deposits to track your asset distribution.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 text-xs gap-1.5 rounded-xl"
              onClick={() => {
                setEditingAccount(null);
                setModalOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              Add First Holding
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {investmentAccounts.map((acc) => {
              const bal = balances.get(acc.id) ?? acc.openingBalance ?? 0;
              const isFund = acc.type === "mutual_fund";
              const isStock = acc.type === "stocks";
              const Icon = isFund ? TrendingUp : isStock ? LineChart : Landmark;

              return (
                <div
                  key={acc.id}
                  className="sx-surface rounded-2xl p-4 border bg-card hover:shadow-fintech-hover transition-all duration-200 flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-foreground truncate">
                          {acc.name}
                        </h4>
                        <span className="inline-block mt-0.5 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                          {acc.type.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAccount(acc);
                          setModalOpen(true);
                        }}
                        title="Edit holding"
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(acc)}
                        title="Delete holding"
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between pt-2 border-t border-border/60">
                    <div>
                      <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                        {formatCurrency(bal)}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-1">invested</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Investment Activity Ledger */}
      <div className="pt-2">
        <InvestmentHistoryPanel transactions={transactions} />
      </div>

      {/* New / Edit Investment Modal */}
      <NewInvestmentModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingAccount(null);
        }}
        initialAccount={editingAccount}
      />
    </div>
  );
}
