"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { isReadOnlyViewer } = useViewerAccess();
  const share = useShareSession();
  const [filters, setFilters] = useState(initialPageFilters);
  const {
    transactions: ledgerTransactions,
    addTransaction,
    deleteTransaction,
    error,
    isLoading: transactionsLoading,
    isMutating,
    updateTransaction,
    refetchTransactions,
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

  // Spec A1.2 — Undo Toast on Delete. Deletes are held for 5s before the
  // real database write, so the user can undo. Pending-delete rows are
  // hidden from the UI immediately for the optimistic "it's gone" feel.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const deleteTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = deleteTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (user?.id) {
      void refetchTransactions();
    }
  }, [refetchTransactions, user?.id]);

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
      (transaction) =>
        !(transaction.category === "Settlements" && transaction.type === "income") &&
        !pendingDeleteIds.has(transaction.id),
    );
    return narrowTransactionsToFilter(
      filterTransactions(visible, filters, purposes),
      { categories: filters.categories, purposeId: filters.purposeId },
      purposes,
    );
  }, [filters, ledgerTransactions, pendingDeleteIds, purposes]);

  const carryForward = useMemo(() => {
    if (!filters.dateFrom) return 0;
    // Always cut off at the start of the calendar month the range begins
    // in — not the exact dateFrom — so a custom range that doesn't start on
    // the 1st (e.g. Mar 15–Apr 10) still carries forward "everything before
    // March," matching This Month/Last Month's whole-month behavior instead
    // of accidentally folding Mar 1–14 into the "prior" bucket.
    const monthStart = `${filters.dateFrom.slice(0, 7)}-01`;
    const priorVisible = ledgerTransactions.filter((t) => {
      if (t.category === "Settlements" && t.type === "income") return false;
      if (pendingDeleteIds.has(t.id)) return false;
      const dateStr = t.transactionDate ?? t.date;
      if (!dateStr) return false;
      return dateStr < monthStart;
    });

    const priorFilters = { ...filters, dateFrom: "", dateTo: "", dashboardDatePreset: "custom" as const };
    const filteredPrior = narrowTransactionsToFilter(
      filterTransactions(priorVisible, priorFilters, purposes),
      { categories: filters.categories, purposeId: filters.purposeId },
      purposes,
    );

    let income = 0;
    let expense = 0;
    for (const t of filteredPrior) {
      const cat = (t.category ?? "").toLowerCase();
      if (cat === "transfer" || cat === "settlements" || cat === "opening balance") continue;
      const amt = Number(t.totalAmount ?? t.amount ?? 0);
      if (t.type === "income") {
        income += amt;
      } else if (t.type === "expense") {
        expense += amt;
      }
    }
    return income - expense;
  }, [filters, ledgerTransactions, pendingDeleteIds, purposes]);

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

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [currentPage, filteredTransactions, pageSize]);

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
    // Outing total line (e.g. "Goa Trip") → open trip details.
    if (transaction.outingId && isOutingRollupTransaction(transaction)) {
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

        // Outing removed or changed → drop old linked outing expense rows + refresh totals.
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
      } else {
        const tags = values.outingId
          ? withoutOutingUnlinkedTag(values.tags)
          : values.tags;
        await addTransaction({ ...values, tags });
        // Newest-first ordering puts a new row on page 1 — without this the
        // user stays on page N and thinks the save didn't work. Filters are
        // reapplied automatically by the filteredTransactions memo.
        setCurrentPage(1);
        if (values.outingId) {
          await syncOutingRollupLedger(user?.id, values.outingId);
        }
        // Always refresh — summary cards, Dashboard, Wealth, Analysis and
        // friend balances all read from these keys.
        await invalidateFinancialData(queryClient, user?.id, {
          outingId: values.outingId ?? undefined,
        });
        notify({
          title: "Transaction saved.",
          description: values.outingId
            ? "Linked to outing — trip total updated."
            : undefined,
        });
      }
      setEditingTransaction(null);
    } catch (submitError) {
      notify({
        title: editingTransaction ? "Couldn't update transaction" : "Couldn't save transaction",
        description:
          submitError instanceof Error ? submitError.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  /** Deletes are confirmed first — this only runs once the user says Delete. */
  function handleDelete(transaction: Transaction) {
    setDetailOpen(false);
    setSelectedTransaction(null);
    setEditingTransaction(null);
    setSlideOverOpen(false);

    setPendingDeleteIds((current) => new Set(current).add(transaction.id));

    const commitDelete = () => {
      deleteTimers.current.delete(transaction.id);
      void deleteTransaction(transaction.id)
        .then(async () => {
          // Cascade: drop linked outing_expenses + recompute trip total in DB.
          await afterTransactionRemovedFromOuting(user?.id, transaction, {
            previousOutingId: transaction.outingId,
          });
          await invalidateFinancialData(queryClient, user?.id, {
            outingId: transaction.outingId ?? undefined,
          });
        })
        .catch(() => {
          // Write failed — bring the row back so it isn't silently lost.
          setPendingDeleteIds((current) => {
            const next = new Set(current);
            next.delete(transaction.id);
            return next;
          });
          notify({
            title: "Couldn't delete transaction.",
            variant: "destructive",
          });
        });
    };

    const timer = window.setTimeout(commitDelete, 5000);
    deleteTimers.current.set(transaction.id, timer);

    notify({
      title: "Transaction deleted successfully.",
      description: `${formatCurrency(transaction.amount)} · ${transaction.merchant}`,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = deleteTimers.current.get(transaction.id);
          if (pending) {
            window.clearTimeout(pending);
            deleteTimers.current.delete(transaction.id);
          }
          setPendingDeleteIds((current) => {
            const next = new Set(current);
            next.delete(transaction.id);
            return next;
          });
          notify({ title: "Transaction restored" });
        },
      },
      duration: 5000,
    });

    return Promise.resolve();
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
            Export CSV
          </Button>
          {!isReadOnlyViewer ? (
            <>
              <Button
                className="border-0 bg-red-500/15 text-red-400 shadow-none hover:bg-red-500/25 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
                disabled={isMutating}
                variant="secondary"
                onClick={() => {
                  setEditingTransaction(null);
                  setSlideOverMode("expense");
                  setSlideOverOpen(true);
                }}
              >
                Add expense
              </Button>
              <Button
                className="border-0 bg-emerald-500/15 text-emerald-400 shadow-none hover:bg-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25"
                disabled={isMutating}
                variant="secondary"
                onClick={() => {
                  setEditingTransaction(null);
                  setSlideOverMode("income");
                  setSlideOverOpen(true);
                }}
              >
                Add income
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <TransactionFilters
        filters={filters}
        isSharedView={Boolean(share)}
        resetFilters={handleResetFilters}
        transactions={allTransactions}
        updateFilter={updateFilter}
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
        />
        <TransactionsPagination
          currentPage={currentPage}
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
        onEdit={isReadOnlyViewer ? undefined : handleSelectTransaction}
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
