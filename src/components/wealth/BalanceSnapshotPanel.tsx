"use client";

import { eachDayOfInterval } from "date-fns";
import { Camera } from "lucide-react";
import { useMemo, useState, type UIEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAccountOpeningDate, getEffectiveOpeningBalance } from "@/lib/accounts";
import { getTodayCalendarDate, toCalendarDate } from "@/lib/date-filters";
import {
  getAccountBalance,
  isBalanceExcludedTransaction,
  transactionAmount,
  transactionMatchesAccount,
} from "@/lib/wealth";
import { cn, formatCurrency } from "@/lib/utils";
import type { Account, OutingExpense, Transaction } from "@/types";

type BalanceSnapshotPanelProps = {
  accounts: Account[];
  transactions: Transaction[];
  /** Unlinked outing cash — same as net-worth formula (mobile parity). */
  unlinkedOutingExpenses?: OutingExpense[];
};

function formatLogDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function BalanceSnapshotPanel({
  accounts,
  transactions,
  unlinkedOutingExpenses = [],
}: BalanceSnapshotPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [findDateInput, setFindDateInput] = useState("");
  const [appliedFindDate, setAppliedFindDate] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);

  const activeAccounts = accounts.filter((account) => account.isActive !== false);

  const accountRows = useMemo(
    () =>
      activeAccounts.map((account) => ({
        account,
        computed: getAccountBalance(
          account,
          transactions,
          unlinkedOutingExpenses,
        ),
      })),
    [activeAccounts, transactions, unlinkedOutingExpenses],
  );

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const selectedAccount = selectedAccountId
    ? (accountsById.get(selectedAccountId) ?? null)
    : null;

  const selectedAccountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions.filter((transaction) =>
      transactionMatchesAccount(transaction, selectedAccount),
    );
  }, [selectedAccount, transactions]);

  // Daily history from real ledger movement only (same exclusions as net worth).
  const selectedAccountHistory = useMemo(() => {
    if (!selectedAccount) return [];
    const today = getTodayCalendarDate();
    const openingDate = getAccountOpeningDate(
      selectedAccount,
      selectedAccountTransactions,
    );
    const startDate = openingDate && openingDate <= today ? openingDate : today;

    const netChangeByDate = new Map<string, number>();
    for (const transaction of selectedAccountTransactions) {
      if (isBalanceExcludedTransaction(transaction)) continue;
      const day = toCalendarDate(
        transaction.transactionDate ?? transaction.date ?? "",
      );
      if (!day) continue;
      const amount = transactionAmount(transaction);
      const delta = transaction.type === "income" ? amount : -amount;
      netChangeByDate.set(day, (netChangeByDate.get(day) ?? 0) + delta);
    }

    // Apply unlinked outing cash on Cash account only (mobile parity).
    if (
      selectedAccount.type === "cash" ||
      selectedAccount.name.trim().toLowerCase() === "cash"
    ) {
      for (const expense of unlinkedOutingExpenses) {
        if (expense.linkedTransactionId) continue;
        if (expense.source === "bank-detected") continue;
        const day = toCalendarDate(expense.date);
        if (!day) continue;
        const amt = Number(expense.amount) || 0;
        netChangeByDate.set(day, (netChangeByDate.get(day) ?? 0) - amt);
      }
    }

    const days = eachDayOfInterval({
      start: new Date(`${startDate}T12:00:00`),
      end: new Date(`${today}T12:00:00`),
    });

    // Seed = opening balance before applying the first day's net change.
    let running =
      getEffectiveOpeningBalance(
        selectedAccount,
        startDate,
        selectedAccountTransactions,
      ) - (netChangeByDate.get(startDate) ?? 0);

    const ascending = days.map((day, index) => {
      const date = toCalendarDate(day);
      const dayChange = netChangeByDate.get(date) ?? 0;
      running += dayChange;
      return { date, balance: running, change: index === 0 ? null : dayChange };
    });

    return ascending.reverse();
  }, [selectedAccount, selectedAccountTransactions, unlinkedOutingExpenses]);

  const displayedHistory = appliedFindDate
    ? selectedAccountHistory.filter((row) => row.date === appliedFindDate)
    : selectedAccountHistory.slice(0, visibleCount);
  const hasOlderHistory =
    !appliedFindDate && visibleCount < selectedAccountHistory.length;

  const currentBalance = selectedAccount
    ? getAccountBalance(
        selectedAccount,
        transactions,
        unlinkedOutingExpenses,
      )
    : 0;

  function handleFindDate() {
    setAppliedFindDate(findDateInput || null);
  }

  function handleShowAllDates() {
    setFindDateInput("");
    setAppliedFindDate(null);
  }

  function handleHistoryScroll(event: UIEvent<HTMLDivElement>) {
    if (appliedFindDate || !hasOlderHistory) return;
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 48) {
      setVisibleCount((count) => count + 30);
    }
  }

  function openModal(accountId: string) {
    setSelectedAccountId(accountId);
    setFindDateInput("");
    setAppliedFindDate(null);
    setVisibleCount(30);
    setModalOpen(true);
  }

  return (
    <div className="sx-surface">
      <div className="border-b px-6 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Camera className="size-4 text-primary" />
          Account Balances
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Full account list with live balances. Open Log for daily history.
        </p>
      </div>

      {accountRows.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          Add accounts in Settings to track balances.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">Account</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accountRows.map((row) => (
                <tr key={row.account.id}>
                  <td className="px-6 py-4 font-medium">
                    {row.account.name}
                    {row.account.last4 ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (••{row.account.last4})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 capitalize text-xs text-muted-foreground">
                    {row.account.type}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">
                    {formatCurrency(row.account.openingBalance ?? 0)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-semibold tabular-nums">
                    {formatCurrency(row.computed)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" onClick={() => openModal(row.account.id)}>
                      Log
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedAccount?.name ?? "Balance history"}</DialogTitle>
            <DialogDescription>
              Daily balance history — same formula as net worth (no double-count).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {selectedAccount?.name ?? "Account"} Balance History
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Opening balance + income − expense by day. Opening-balance ledger
                rows and outing total lines are excluded so balances stay correct.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor="history-find-date">
                  Select Date
                </Label>
                <Input
                  className="h-9 w-40"
                  id="history-find-date"
                  type="date"
                  value={findDateInput}
                  onChange={(event) => setFindDateInput(event.target.value)}
                />
              </div>
              <Button size="sm" type="button" onClick={handleFindDate}>
                Find
              </Button>
              {appliedFindDate ? (
                <button
                  className="text-xs text-primary hover:underline"
                  type="button"
                  onClick={handleShowAllDates}
                >
                  Show all
                </button>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {selectedAccount?.name ?? "Account"} History
              </p>
              {selectedAccountHistory.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No balance history yet.
                </p>
              ) : displayedHistory.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No record for this date.
                </p>
              ) : (
                <div
                  className="max-h-72 overflow-y-auto rounded-lg border"
                  onScroll={handleHistoryScroll}
                >
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-xs font-medium text-muted-foreground">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-right">
                          {selectedAccount?.name ?? "Account"} Balance
                        </th>
                        <th className="px-3 py-2 text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {displayedHistory.map((row) => (
                        <tr key={row.date}>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatLogDate(row.date)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {formatCurrency(row.balance)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-right font-mono",
                              row.change === null || row.change === 0
                                ? "text-muted-foreground"
                                : row.change > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400",
                            )}
                          >
                            {row.change === null
                              ? "—"
                              : row.change > 0
                                ? `+${formatCurrency(row.change)}`
                                : row.change < 0
                                  ? `-${formatCurrency(Math.abs(row.change))}`
                                  : "₹0"}
                          </td>
                        </tr>
                      ))}
                      {hasOlderHistory ? (
                        <tr>
                          <td
                            className="px-3 py-2 text-center text-xs text-muted-foreground"
                            colSpan={3}
                          >
                            Scroll to view more records
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {selectedAccount ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Current Balance
              </p>
              <span className="font-mono text-sm font-semibold">
                {formatCurrency(currentBalance)}
              </span>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
