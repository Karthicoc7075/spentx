"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchUserProfile } from "@/lib/supabase-data";
import { getDateRangeForDashboardPreset } from "@/lib/date-filters";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
import { TransactionSummaryStrip } from "@/components/shared/TransactionSummaryStrip";
import { TransactionDetailPanel } from "@/components/shared/TransactionDetailPanel";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionsLedgerTable } from "@/components/transactions/TransactionsLedgerTable";
import {
  TRANSACTION_PAGE_SIZES,
  TransactionsPagination,
  type TransactionPageSize,
} from "@/components/transactions/TransactionsPagination";
import { Download, Minus, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useCategories } from "@/hooks/useCategories";
import { useOutings } from "@/hooks/useOutings";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { createDefaultGlobalFilters } from "@/lib/filter-defaults";
import { getMonthDateRange } from "@/lib/dashboard";
import {
  buildTransactionsListRows,
  isOutingRollupTransaction,
} from "@/lib/outings";
import { getCurrentPlanMonth } from "@/lib/plan";
import { getPurposeDisplayName } from "@/lib/purposes";
import { sumPeriodExpense, sumPeriodIncome } from "@/lib/period-totals";
import {
  withOutingUnlinkedTag,
  withoutOutingUnlinkedTag,
} from "@/lib/outing-sync";
import type { UnlinkOutingChoice } from "@/components/outings/UnlinkOutingDialog";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import {
  afterTransactionRemovedFromOuting,
  syncOutingRollupLedger,
} from "@/lib/outing-ledger-sync";
import {
  compareTransactionsNewestFirst,
  computeFilteredDisplayAmount,
  downloadCsv,
  filterTransactions,
  formatCurrency,
  narrowTransactionsToFilter,
  toCsv,
} from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useShareSession } from "@/providers/share-provider";
import { useViewerAccess } from "@/providers/viewer-provider";
import { useToast } from "@/providers/toast-provider";
import type { GlobalFilters, Transaction } from "@/types";

const DEFAULT_PAGE_SIZE: TransactionPageSize = 30;

const initialPageFilters: GlobalFilters = createDefaultGlobalFilters({
  dateFrom: getMonthDateRange(getCurrentPlanMonth()).dateFrom,
  dateTo: getMonthDateRange(getCurrentPlanMonth()).dateTo,
  dashboardDatePreset: "this-month",
});

function sortTransactionsNewest(transactions: Transaction[]) {
  return [...transactions].sort(compareTransactionsNewestFirst);
}

export function TransactionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, authUser } = useAuthReady();
  const { purposes } = usePurposes();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { isReadOnlyViewer } = useViewerAccess();
  const share = useShareSession();
  const [filters, setFilters] = useState(initialPageFilters);

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile-joined", user?.id],
    queryFn: () => fetchUserProfile(user?.id),
    enabled: !share && !isReadOnlyViewer && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  const currentMonth = getCurrentPlanMonth();

  const accountCreatedMonth = useMemo(() => {
    const rawDate = userProfile?.joinedAt ?? user?.createdAt ?? authUser?.created_at;
    if (!rawDate) return currentMonth;
    const match = rawDate.match(/^(\d{4})-(\d{2})/);
    const parsed = match ? `${match[1]}-${match[2]}` : currentMonth;
    return parsed > currentMonth ? currentMonth : parsed;
  }, [userProfile?.joinedAt, user?.createdAt, authUser?.created_at, currentMonth]);
  const {
    transactions: ledgerTransactions,
    addTransaction,
    deleteTransaction,
    verifyTransaction,
    rejectTransaction,
    error,
    isLoading: transactionsLoading,
    isMutating,
    updateTransaction,
  } = useTransactions();
  // Live outing expense totals — rollup row amount must match outing detail
  // (e.g. "test" ₹8,788), not a stale first-expense amount on the ledger row.
  const { expenses: allOutingExpenses } = useAllOutingExpenses();
  const { outings } = useOutings();

  // Normal spends always stay visible. Outing-linked rows collapse into ONE
  // "Outing total" line per trip only when a rollup exists — so the list never
  // shrinks to a single row by hiding everything else. Passing `outings` also
  // narrows that line to what the current user paid and labels the account
  // "Mixed" when they paid from more than one.
  const allTransactions = useMemo(
    () => buildTransactionsListRows(ledgerTransactions, allOutingExpenses, outings),
    [ledgerTransactions, allOutingExpenses, outings],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<TransactionPageSize>(DEFAULT_PAGE_SIZE);

  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const unverifiedCount = useMemo(
    () =>
      ledgerTransactions.filter(
        (t) =>
          t.status === "unverified" &&
          t.isActive !== false &&
          !t.deletedAt &&
          !pendingDeleteIds.has(t.id),
      ).length,
    [ledgerTransactions, pendingDeleteIds],
  );

  async function handleVerify(transaction: Transaction) {
    try {
      await verifyTransaction(transaction.id);
      notify({
        title: "Transaction verified",
        description: `${transaction.merchant || "Transaction"} confirmed and added to your ledger.`,
      });
    } catch (err) {
      notify({
        title: "Failed to verify transaction",
        description: err instanceof Error ? err.message : "An error occurred.",
        variant: "destructive",
      });
    }
  }

  async function handleReject(transaction: Transaction) {
    try {
      await rejectTransaction(transaction.id);
      notify({
        title: "Transaction rejected",
        description: `${transaction.merchant || "Transaction"} was rejected.`,
      });
    } catch (err) {
      notify({
        title: "Failed to reject transaction",
        description: err instanceof Error ? err.message : "An error occurred.",
        variant: "destructive",
      });
    }
  }

  // Settlement rows (both directions) stay visible here — the ledger is where
  // users check "did that repayment get recorded?". They're still excluded
  // from the totals strip below so a repayment isn't counted as earnings.
  const filteredTransactions = useMemo(() => {
    const visible = allTransactions.filter(
      (transaction) => !pendingDeleteIds.has(transaction.id),
    );
    return sortTransactionsNewest(
      filterTransactions(visible, filters, purposes),
    );
  }, [allTransactions, filters, purposes, pendingDeleteIds]);

  // Full ledger with the same filters — strip totals use this (not the
  // display list) so outing rollups are not double-counted vs Dashboard.
  // narrowTransactionsToFilter: a Purpose/Category filter must total only
  // the matching split amount (e.g. Big Basket's ₹1,200 Personal split),
  // not the whole transaction — same rule the Dashboard now follows.
  const filteredLedgerForTotals = useMemo(() => {
    const visible = ledgerTransactions.filter(
      (transaction) => !pendingDeleteIds.has(transaction.id),
    );
    return narrowTransactionsToFilter(
      filterTransactions(visible, filters, purposes),
      { categories: filters.categories, purposeId: filters.purposeId },
      purposes,
    );
  }, [filters, ledgerTransactions, pendingDeleteIds, purposes]);

  const carryForward = useMemo(() => {
    const activeMonth = filters.dateFrom
      ? filters.dateFrom.slice(0, 7)
      : currentMonth;

    const [yearStr, monthStr] = activeMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, "0");
    const prevMonthKey = `${prevYear}-${prevMonthStr}`;

    const prevMonthRange = getMonthDateRange(prevMonthKey);

    const priorVisible = ledgerTransactions.filter((t) => {
      if (pendingDeleteIds.has(t.id)) return false;
      const dateStr = t.transactionDate ?? t.date;
      if (!dateStr) return false;
      const day = dateStr.slice(0, 10);
      return day >= prevMonthRange.dateFrom && day <= prevMonthRange.dateTo;
    });

    const priorFilters = {
      ...filters,
      dateFrom: prevMonthRange.dateFrom,
      dateTo: prevMonthRange.dateTo,
      dashboardDatePreset: "custom" as const,
      transactionType: "" as const,
    };
    const filteredPrior = narrowTransactionsToFilter(
      filterTransactions(priorVisible, priorFilters, purposes),
      { categories: filters.categories, purposeId: filters.purposeId },
      purposes,
    );

    const income = sumPeriodIncome(filteredPrior, prevMonthRange);
    const expense = sumPeriodExpense(filteredPrior, {
      range: prevMonthRange,
      unlinkedOutingExpenses: allOutingExpenses,
      categories,
      includeOutingExpenses: true,
    });
    return income - expense;
  }, [
    filters,
    ledgerTransactions,
    pendingDeleteIds,
    purposes,
    allOutingExpenses,
    categories,
    currentMonth,
  ]);

  // Only built when a Purpose/Category filter is active — a split
  // transaction's row should show the sum of just its matching splits
  // instead of the total (Normal/Friend Split/Outing rows are untouched).
  const displayAmounts = useMemo(() => {
    if (!filters.categories.length && !filters.purposeId) return undefined;
    const map = new Map<string, number>();
    for (const transaction of filteredTransactions) {
      map.set(
        transaction.id,
        computeFilteredDisplayAmount(transaction, filters, purposes),
      );
    }
    return map;
  }, [filteredTransactions, filters, purposes]);

  /** Active Purpose/Category filter values, spelled out on partially
   * matched rows as "Matched: Family · Grocery". */
  const matchedLabels = useMemo(() => {
    const labels: string[] = [];
    if (filters.purposeId) {
      labels.push(getPurposeDisplayName(filters.purposeId, purposes));
    }
    labels.push(...filters.categories);
    return labels;
  }, [filters.purposeId, filters.categories, purposes]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / pageSize) || 1,
  );

  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [currentPage, totalPages]);

  const pageTransactions = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [safeCurrentPage, filteredTransactions, pageSize]);

  const pageLoading = Boolean(
    user?.id && transactionsLoading && allTransactions.length === 0,
  );

  function updateFilter<K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setCurrentPage(1);
  }

  function updateFilters(updates: Partial<GlobalFilters>) {
    setFilters((current) => ({ ...current, ...updates }));
    setCurrentPage(1);
  }

  function handleResetFilters() {
    setFilters(initialPageFilters);
    setCurrentPage(1);
  }

  function handlePageSizeChange(size: TransactionPageSize) {
    if (!TRANSACTION_PAGE_SIZES.includes(size)) return;
    setPageSize(size);
    setCurrentPage(1);
  }

  const { notify } = useToast();
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverMode, setSlideOverMode] =
    useState<Transaction["type"]>("expense");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(
    null,
  );
  /** Opens the slide-over with Split Expense already on (unlink → convert). */
  const [convertToSplit, setConvertToSplit] = useState(false);

  function handleSelectTransaction(transaction: Transaction) {
    // Outing total line (e.g. "Goa Trip") → open trip details (unless read-only viewer).
    if (!isReadOnlyViewer && transaction.outingId && isOutingRollupTransaction(transaction)) {
      router.push(`/outings/${transaction.outingId}`);
      return;
    }

    // Outing-linked rows open the detail panel so the Linked Outing block
    // (and its Unlink action) is reachable — the edit slide-over has no way
    // to show them.
    if (isReadOnlyViewer || transaction.outingId) {
      setSelectedTransaction(transaction);
      setDetailOpen(true);
      return;
    }

    setEditingTransaction(transaction);
    setSlideOverMode(transaction.type);
    setSlideOverOpen(true);
  }

  async function handleUnlinkOuting(
    transaction: Transaction,
    choice: UnlinkOutingChoice = "normal",
  ) {
    if (!transaction.outingId) return;
    try {
      const outingId = transaction.outingId;
      await updateTransaction({
        id: transaction.id,
        transaction: {
          outingId: null,
          tags: withOutingUnlinkedTag(transaction.tags),
        },
      });
      await afterTransactionRemovedFromOuting(user?.id, transaction, {
        previousOutingId: outingId,
      });
      await invalidateFinancialData(queryClient, user?.id, { outingId });
      setDetailOpen(false);
      setSelectedTransaction(null);

      // "Convert to Split Transaction" — hand the now-unlinked transaction
      // straight to the Split Expense form. It updates this same row; it
      // never creates another transaction or another outing.
      if (choice === "split") {
        setEditingTransaction({
          ...transaction,
          outingId: null,
          tags: withOutingUnlinkedTag(transaction.tags),
        });
        setSlideOverMode(transaction.type);
        setConvertToSplit(true);
        setSlideOverOpen(true);
        return;
      }

      notify({
        title: "Unlinked from outing",
        description: "This spend is no longer part of the trip. Trip total updated.",
      });
    } catch (error) {
      notify({
        title: "Couldn't unlink",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  async function handleSubmit(values: Omit<Transaction, "id">) {
    try {
      if (editingTransaction) {
        const previous = editingTransaction;
        const previousOutingId = previous.outingId ?? null;
        const nextOutingId = values.outingId ?? null;

        // Keep opt-out tag when unlinking so auto-add does not re-attach;
        // clear it when user explicitly re-links to a trip.
        let tags = values.tags;
        if (previousOutingId && !nextOutingId) {
          tags = withOutingUnlinkedTag(values.tags ?? previous.tags);
        } else if (nextOutingId) {
          tags = withoutOutingUnlinkedTag(values.tags ?? previous.tags);
        }

        const payload = { ...values, tags };
        await updateTransaction({ id: previous.id, transaction: payload });

        notify({
          title: "Transaction updated",
          description:
            previousOutingId || nextOutingId
              ? "Outing totals refreshed on Transactions."
              : undefined,
          action: {
            label: "Undo",
            onClick: () => {
              updateTransaction({ id: previous.id, transaction: previous })
                .then(() => notify({ title: "Changes reverted" }))
                .catch(() =>
                  notify({
                    title: "Couldn't revert changes.",
                    variant: "destructive",
                  }),
                );
            },
          },
        });

        // Don't block the form close on outing/cache refresh — a failure
        // here used to look like save failed and the next click duplicated.
        void (async () => {
          try {
            if (previousOutingId && previousOutingId !== nextOutingId) {
              await afterTransactionRemovedFromOuting(
                user?.id,
                { id: previous.id, outingId: nextOutingId },
                { previousOutingId },
              );
            } else if (nextOutingId) {
              await syncOutingRollupLedger(user?.id, nextOutingId);
            }
            await invalidateFinancialData(queryClient, user?.id, {
              outingId: nextOutingId ?? previousOutingId ?? undefined,
            });
          } catch (refreshError) {
            console.error("Post-update financial refresh failed", refreshError);
          }
        })();
      } else {
        const tags = values.outingId
          ? withoutOutingUnlinkedTag(values.tags)
          : values.tags;
        setCurrentPage(1);
        setEditingTransaction(null);
        setSlideOverOpen(false);
        notify({
          title: "Transaction saved.",
          description: values.outingId
            ? "Linked to outing — trip total updated."
            : undefined,
        });
        await addTransaction({ ...values, tags });
        const outingId = values.outingId;
        void (async () => {
          try {
            if (outingId) {
              await syncOutingRollupLedger(user?.id, outingId);
            }
            await invalidateFinancialData(queryClient, user?.id, {
              outingId: outingId ?? undefined,
            });
          } catch (refreshError) {
            console.error("Post-save financial refresh failed", refreshError);
          }
        })();
      }
    } catch (submitError) {
      notify({
        title: editingTransaction ? "Couldn't update transaction" : "Couldn't save transaction",
        description:
          submitError instanceof Error ? submitError.message : "Try again.",
        variant: "destructive",
      });
      throw submitError;
    }
  }

  /** Deletes are confirmed first — commits delete directly to server so it never reverts on tab close/refresh. */
  async function handleDelete(transaction: Transaction) {
    setDetailOpen(false);
    setSelectedTransaction(null);
    setEditingTransaction(null);
    setSlideOverOpen(false);

    setPendingDeleteIds((current) => new Set(current).add(transaction.id));

    try {
      await deleteTransaction(transaction.id);
      // Cascade: drop linked outing_expenses + recompute trip total in DB.
      await afterTransactionRemovedFromOuting(user?.id, transaction, {
        previousOutingId: transaction.outingId,
      });
      await invalidateFinancialData(queryClient, user?.id, {
        outingId: transaction.outingId ?? undefined,
      });
      notify({
        title: "Transaction deleted successfully.",
        description: `${formatCurrency(transaction.amount)} · ${transaction.merchant}`,
      });
    } catch (err) {
      setPendingDeleteIds((current) => {
        const next = new Set(current);
        next.delete(transaction.id);
        return next;
      });
      notify({
        title: "Couldn't delete transaction.",
        description: err instanceof Error ? err.message : "Server failed to delete.",
        variant: "destructive",
      });
    }
  }

  function requestDelete(transaction: Transaction) {
    setDeleteTarget(transaction);
    return Promise.resolve();
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every rupee in and out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-end">
          <Button
            variant="outline"
            disabled={pageLoading || filteredTransactions.length === 0}
            onClick={() => {
              // detailed: also emits one line per split row for Split Expenses.
              downloadCsv(
                "spentx-transactions.csv",
                toCsv(filteredTransactions, { purposes, detailed: true }),
              );
            }}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
          {!isReadOnlyViewer ? (
            <>
              <Button
                variant="outline"
                disabled={isMutating}
                className="gap-1.5 border-rose-500/20 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/15"
                onClick={() => {
                  setEditingTransaction(null);
                  setSlideOverMode("expense");
                  setSlideOverOpen(true);
                }}
              >
                <Minus className="size-4 text-rose-500" />
                Add Expense
              </Button>
              <Button
                disabled={isMutating}
                className="gap-1.5"
                onClick={() => {
                  setEditingTransaction(null);
                  setSlideOverMode("income");
                  setSlideOverOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add Income
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {unverifiedCount > 0 && !share ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Zap className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {unverifiedCount} Unverified {unverifiedCount === 1 ? "transaction" : "transactions"} detected
              </p>
              <p className="text-xs text-muted-foreground">
                Uploaded via mobile sync. Excluded from totals until verified, edited, or rejected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {filters.status === "unverified" ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateFilter("status", "")}
              >
                Show All
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold border-amber-500/30 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                onClick={() => updateFilter("status", "unverified")}
              >
                Review Unverified ({unverifiedCount})
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <TransactionFilters
        filters={filters}
        isSharedView={Boolean(share)}
        resetFilters={handleResetFilters}
        transactions={allTransactions}
        updateFilter={updateFilter}
        updateFilters={updateFilters}
      />

      <TransactionSummaryStrip
        accounts={accounts}
        carryForward={carryForward}
        categories={categories}
        filters={filters}
        ledgerTransactions={filteredLedgerForTotals}
        outingExpenses={allOutingExpenses}
        transactions={filteredTransactions}
      />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Transactions failed to load.
        </div>
      ) : null}

      <div className="grid gap-4">
        <TransactionsLedgerTable
          displayAmounts={displayAmounts}
          isLoading={pageLoading}
          matchedLabels={matchedLabels}
          transactions={pageTransactions}
          onClearFilters={handleResetFilters}
          onSelect={handleSelectTransaction}
          onVerify={isReadOnlyViewer ? undefined : handleVerify}
          onReject={isReadOnlyViewer ? undefined : handleReject}
        />
        <TransactionsPagination
          currentPage={safeCurrentPage}
          pageSize={pageSize}
          totalCount={filteredTransactions.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <AddTransactionSlideOver
        forceSplitExpense={convertToSplit}
        initialValues={editingTransaction ?? undefined}
        mode={slideOverMode}
        open={slideOverOpen}
        onDelete={requestDelete}
        onOpenChange={(open) => {
          setSlideOverOpen(open);
          if (!open) {
            setEditingTransaction(null);
            setConvertToSplit(false);
          }
        }}
        onSubmit={handleSubmit}
      />
      <TransactionDetailPanel
        activeFilters={filters}
        open={detailOpen}
        transaction={selectedTransaction}
        onDelete={isReadOnlyViewer ? undefined : requestDelete}
        onVerify={isReadOnlyViewer ? undefined : handleVerify}
        onReject={isReadOnlyViewer ? undefined : handleReject}
        onEdit={
          isReadOnlyViewer
            ? undefined
            : (tx) => {
                setDetailOpen(false);
                setEditingTransaction(tx);
                setSlideOverMode(tx.type);
                setSlideOverOpen(true);
              }
        }
        onOpenChange={setDetailOpen}
        onUnlinkOuting={isReadOnlyViewer ? undefined : handleUnlinkOuting}
        outingExpenses={allOutingExpenses}
      />
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        itemLabel="Transaction"
        description="Are you sure you want to delete this transaction and all related records?"
        detail={
          deleteTarget
            ? `${formatCurrency(deleteTarget.amount)} \u00b7 ${deleteTarget.merchant}`
            : undefined
        }
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void handleDelete(target);
        }}
      />
    </div>
  );
}
