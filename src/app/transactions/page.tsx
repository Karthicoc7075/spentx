"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { createDefaultGlobalFilters } from "@/lib/filter-defaults";
import { getMonthDateRange } from "@/lib/dashboard";
import { getCurrentPlanMonth } from "@/lib/plan";
import { downloadCsv, filterTransactions, formatCurrency, toCsv } from "@/lib/utils";
import { findLikelyDuplicate } from "@/lib/transaction-summary";
import { useAuthReady } from "@/hooks/useAuthReady";
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
  return [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export default function TransactionsPage() {
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { isReadOnlyViewer } = useViewerAccess();
  const [filters, setFilters] = useState(initialPageFilters);
  const {
    transactions: allTransactions,
    addTransaction,
    deleteTransaction,
    error,
    isLoading: transactionsLoading,
    isMutating,
    updateTransaction,
    refetchTransactions,
  } = useTransactions();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<TransactionPageSize>(DEFAULT_PAGE_SIZE);

  // Spec A1.2 — Undo Toast on Delete. Deletes are held for 5s before the
  // real Firestore write, so the user can undo. Pending-delete rows are
  // hidden from the UI immediately for the optimistic "it's gone" feel.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
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

  const filteredTransactions = useMemo(() => {
    const visible = allTransactions.filter(
      (transaction) =>
        !(transaction.category === "Settlements" && transaction.type === "income") &&
        !pendingDeleteIds.has(transaction.id),
    );
    return sortTransactionsNewest(
      filterTransactions(visible, filters, purposes),
    );
  }, [allTransactions, filters, purposes, pendingDeleteIds]);

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

  function handleSelectTransaction(transaction: Transaction) {
    if (isReadOnlyViewer) {
      setSelectedTransaction(transaction);
      setDetailOpen(true);
      return;
    }

    setEditingTransaction(transaction);
    setSlideOverMode(transaction.type);
    setSlideOverOpen(true);
  }

  async function handleSubmit(values: Omit<Transaction, "id">) {
    if (editingTransaction) {
      const previous = editingTransaction;
      await updateTransaction({ id: previous.id, transaction: values });
      notify({
        title: "Transaction updated",
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
      await addTransaction(values);
      notify({ title: "Transaction saved." });
    }
    setEditingTransaction(null);
  }

  function handleDelete(transaction: Transaction) {
    setDetailOpen(false);
    setSelectedTransaction(null);
    setEditingTransaction(null);
    setSlideOverOpen(false);

    setPendingDeleteIds((current) => new Set(current).add(transaction.id));

    const commitDelete = () => {
      deleteTimers.current.delete(transaction.id);
      void deleteTransaction(transaction.id).catch(() => {
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
      title: "Transaction deleted",
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
              downloadCsv("spentx-transactions.csv", toCsv(filteredTransactions));
            }}
          >
            Export CSV
          </Button>
          {!isReadOnlyViewer ? (
            <>
              <Button
                className="bg-red-100 text-red-700 shadow-none hover:bg-red-200 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
                disabled={isMutating}
                onClick={() => {
                  setEditingTransaction(null);
                  setSlideOverMode("expense");
                  setSlideOverOpen(true);
                }}
              >
                Add expense
              </Button>
              <Button
                disabled={isMutating}
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
        resetFilters={handleResetFilters}
        updateFilter={updateFilter}
      />

      <TransactionSummaryStrip filters={filters} transactions={filteredTransactions} />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Transactions failed to load.
        </div>
      ) : null}

      <div className="grid gap-4">
        <TransactionsLedgerTable
          isLoading={pageLoading}
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
        initialValues={editingTransaction ?? undefined}
        mode={slideOverMode}
        open={slideOverOpen}
        onDelete={handleDelete}
        onOpenChange={(open) => {
          setSlideOverOpen(open);
          if (!open) setEditingTransaction(null);
        }}
        onSubmit={handleSubmit}
      />
      {isReadOnlyViewer ? (
        <TransactionDetailPanel
          open={detailOpen}
          transaction={selectedTransaction}
          onDelete={handleDelete}
          onEdit={handleSelectTransaction}
          onOpenChange={setDetailOpen}
        />
      ) : null}
    </div>
  );
}