"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
  fetchAccounts,
  fetchCategories,
  fetchFriends,
  fetchIncomeStreams,
  fetchIncomeTargets,
  fetchMonthlyPlan,
  fetchPlanTemplates,
  fetchProjectorSettings,
  fetchPurposes,
  fetchReflections,
  fetchSavingsGoals,
  fetchTransactions,
  saveOuting,
  subscribeToOutings,
  subscribeToOutingExpenseChanges,
  subscribeToTransactions,
  deleteOuting,
} from "@/lib/supabase-data";
import { syncAllOutingRollups } from "@/lib/outing-ledger-sync";
import { getCurrentPlanMonth } from "@/lib/plan";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { useApplyUserPreferences } from "@/hooks/useApplyUserPreferences";
import {
  cacheKeys,
  hydrateQueryCaches,
  readQueryCache,
  readQueryCacheSavedAt,
  removeQueryCache,
  writeQueryCache,
} from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { withoutMockTransactions } from "@/lib/mock-data";
import { transactionMatchesPurpose } from "@/lib/purposes";
import { useShareSession } from "@/providers/share-provider";
import { useViewerAccess } from "@/providers/viewer-provider";
import type { FriendSplit, Outing, Transaction } from "@/types";

type AppDataContextValue = {
  transactions: Transaction[];
  transactionsLoading: boolean;
  transactionsError: Error | null;
  outings: Outing[];
  outingsLoading: boolean;
  addTransaction: (transaction: Omit<Transaction, "id">) => Promise<Transaction>;
  updateTransaction: (args: {
    id: string;
    transaction: Partial<Transaction>;
  }) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addOuting: (
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) => Promise<Outing>;
  updateOuting: (outing: Outing) => Promise<Outing>;
  removeOuting: (outingId: string) => Promise<void>;
  isTransactionsMutating: boolean;
  lastSyncedAt: Date | null;
  reloadTransactions: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

function assertCanMutate(isReadOnlyViewer: boolean) {
  if (isReadOnlyViewer) {
    throw new Error("Read-only viewer access cannot modify data.");
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Admin portal never needs the personal ledger/outings/prefetch storm —
  // those pages only call admin RPCs. Skipping here cuts 15–30 proxy calls
  // on every /admin refresh.
  const isAdminRoute = pathname.startsWith("/admin");
  const isShareRoute = pathname.startsWith("/share");
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId, isReadOnlyViewer, sharedPurposeIds } = useViewerAccess();
  const share = useShareSession();
  // Anonymous share sessions have no auth.uid(), so every direct
  // fetch/subscribe/prefetch below (all owner-RLS-gated) would just fail —
  // forcing effectiveUserId to undefined makes this provider a clean no-op
  // for share sessions; useTransactions' RPC-backed React Query layer is
  // the sole data source there instead.
  const effectiveUserId = share || isAdminRoute || isShareRoute ? undefined : (dataOwnerId ?? user?.id);
  const queryClient = useQueryClient();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<Error | null>(null);
  const [outings, setOutings] = useState<Outing[]>([]);
  const [outingsLoading, setOutingsLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const prefetchedRef = useRef<string | undefined>(undefined);
  const transactionsRef = useRef<Transaction[]>([]);

  // Automatic backups (weekly + debounced on-change). Only for the signed-in
  // owner — read-only viewers must not back up someone else's data. Admins
  // on /admin also skip (no personal-data edits there).
  useAutoBackup(isReadOnlyViewer || isAdminRoute ? undefined : user?.id);

  // Apply the viewer's own display preferences (currency, private mode)
  // to the app-wide formatCurrency singleton. Not needed on admin routes.
  useApplyUserPreferences(isAdminRoute ? undefined : user?.id);

  const filterViewerTransactions = useCallback(
    (items: Transaction[]) => {
      if (!isReadOnlyViewer) return items;
      return items.filter((transaction) =>
        sharedPurposeIds.some((purposeId) =>
          transactionMatchesPurpose(transaction.purpose, purposeId, []),
        ),
      );
    },
    [isReadOnlyViewer, sharedPurposeIds],
  );

  useLayoutEffect(() => {
    if (!effectiveUserId) return;

    hydrateQueryCaches(queryClient, effectiveUserId);

    const cachedTransactions = readQueryCache<Transaction[]>(
      effectiveUserId,
      cacheKeys.transactions,
    );
    if (cachedTransactions !== undefined && cachedTransactions.length > 0) {
      const cleaned = filterViewerTransactions(
        withoutMockTransactions(cachedTransactions),
      );
      transactionsRef.current = cleaned;
      setTransactions(cleaned);
      setTransactionsLoading(false);
      if (cleaned.length !== cachedTransactions.length) {
        writeQueryCache(effectiveUserId, cacheKeys.transactions, cleaned);
        queryClient.setQueryData(queryKeys.transactions(effectiveUserId), cleaned);
      }
      const savedAt = readQueryCacheSavedAt(effectiveUserId, cacheKeys.transactions);
      if (savedAt) {
        setLastSyncedAt(new Date(savedAt));
      }
    }
  }, [effectiveUserId, filterViewerTransactions, queryClient]);

  useEffect(() => {
    if (isConfigured && !isReady) return;

    if (isConfigured && !effectiveUserId) {
      setTransactions([]);
      setOutings([]);
      setTransactionsLoading(false);
      setOutingsLoading(false);
      return;
    }

    const userId = effectiveUserId;
    let cancelled = false;

    function hydrateTransactions(
      next: Transaction[],
      syncedAt: Date = new Date(),
    ) {
      if (cancelled) return;
      const cleaned = filterViewerTransactions(withoutMockTransactions(next));
      transactionsRef.current = cleaned;
      setTransactions(cleaned);
      setTransactionsError(null);
      queryClient.setQueryData(queryKeys.transactions(userId), cleaned);
      if (cleaned.length === 0) {
        removeQueryCache(userId, cacheKeys.transactions);
      } else {
        writeQueryCache(userId, cacheKeys.transactions, cleaned);
      }
      setTransactionsLoading(false);
      setLastSyncedAt(syncedAt);
    }

    const cachedFromStorage = readQueryCache<Transaction[]>(
      userId,
      cacheKeys.transactions,
    );
    if (cachedFromStorage !== undefined && cachedFromStorage.length === 0) {
      removeQueryCache(userId, cacheKeys.transactions);
    }
    if (cachedFromStorage !== undefined && cachedFromStorage.length > 0) {
      const savedAt = readQueryCacheSavedAt(userId, cacheKeys.transactions);
      hydrateTransactions(
        cachedFromStorage,
        savedAt ? new Date(savedAt) : new Date(),
      );
    } else {
      const cachedTransactions = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(userId),
      );
      if (cachedTransactions !== undefined && cachedTransactions.length > 0) {
        hydrateTransactions(cachedTransactions);
      }
    }

    const cachedOutings = queryClient.getQueryData<Outing[]>(
      queryKeys.outings(userId),
    );
    if (cachedOutings) {
      setOutings(cachedOutings);
      setOutingsLoading(false);
    }

    void fetchTransactions(userId)
      .then((fetched) => {
        hydrateTransactions(fetched);
      })
      .catch((error) => {
        if (!cancelled) {
          setTransactionsError(
            error instanceof Error ? error : new Error("Failed to load transactions"),
          );
          setTransactionsLoading(false);
        }
      });

    const unsubscribeTransactions = subscribeToTransactions(
      userId,
      (next) => {
        hydrateTransactions(next);
      },
      (error) => {
        setTransactionsError(error);
        setTransactionsLoading(false);
      },
    );

    let unsubscribeOutings: () => void = () => {};
    let unsubscribeOutingExpenses: () => void = () => {};
    if (!isReadOnlyViewer) {
      unsubscribeOutings = subscribeToOutings(
        user?.id,
        (next) => {
          setOutings(next);
          queryClient.setQueryData(queryKeys.outings(user?.id), next);
          setOutingsLoading(false);
        },
        () => setOutingsLoading(false),
      );
      // Mobile outing-expense edits: NW/Wealth already use expenses (correct);
      // Transactions shows a separate "Outing total" rollup row — rewrite it
      // immediately so the list amount matches outing detail.
      unsubscribeOutingExpenses = subscribeToOutingExpenseChanges(user?.id, () => {
        void (async () => {
          try {
            await syncAllOutingRollups(user?.id);
          } catch {
            // Fall through to cache invalidation so the page still recovers.
          }
          if (cancelled) return;
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.outingExpenses(user?.id),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.allOutingExpenses(user?.id),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.transactions(user?.id),
            }),
          ]);
          const fetched = await fetchTransactions(userId);
          if (!cancelled) hydrateTransactions(fetched);
        })();
      });
    } else {
      setOutings([]);
      setOutingsLoading(false);
    }

    return () => {
      cancelled = true;
      unsubscribeTransactions();
      unsubscribeOutings();
      unsubscribeOutingExpenses();
    };
  }, [
    effectiveUserId,
    filterViewerTransactions,
    isConfigured,
    isReadOnlyViewer,
    isReady,
    queryClient,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id || !effectiveUserId || prefetchedRef.current === user.id) return;
    prefetchedRef.current = user.id;

    const userId = user.id;
    const dataUserId = effectiveUserId;
    const currentMonth = getCurrentPlanMonth();

    function prefetchWithCache<T>(
      queryKey: readonly unknown[],
      cacheKey: string,
      queryFn: () => Promise<T>,
      cacheUserId = dataUserId,
    ) {
      const cached = readQueryCache<T>(cacheUserId, cacheKey);
      if (cached !== undefined) {
        queryClient.setQueryData(queryKey, cached);
      }

      return queryClient.prefetchQuery({
        queryKey,
        queryFn: async () => {
          const data = await queryFn();
          writeQueryCache(cacheUserId, cacheKey, data);
          return data;
        },
      });
    }

    const viewerPrefetches = [
      prefetchWithCache(
        queryKeys.accounts(dataUserId),
        cacheKeys.accounts,
        () => fetchAccounts(dataUserId),
      ),
      prefetchWithCache(
        queryKeys.categories(dataUserId),
        cacheKeys.categories,
        () => fetchCategories(dataUserId),
      ),
      prefetchWithCache(
        queryKeys.purposes(dataUserId),
        cacheKeys.purposes,
        () => fetchPurposes(dataUserId),
      ),
    ];

    if (isReadOnlyViewer) {
      void Promise.all(viewerPrefetches);
      return;
    }

    void Promise.all([
      ...viewerPrefetches,
      prefetchWithCache(
        queryKeys.friends(userId),
        cacheKeys.friends,
        () => fetchFriends(userId),
      ),
      prefetchWithCache(
        queryKeys.incomeStreams(userId),
        cacheKeys.incomeStreams,
        () => fetchIncomeStreams(userId),
      ),
      prefetchWithCache(
        queryKeys.incomeTargets(userId),
        cacheKeys.incomeTargets,
        () => fetchIncomeTargets(userId),
      ),
      prefetchWithCache(
        queryKeys.savingsGoals(userId),
        cacheKeys.savingsGoals,
        () => fetchSavingsGoals(userId),
      ),
      prefetchWithCache(
        queryKeys.projectorSettings(userId),
        cacheKeys.projectorSettings,
        () => fetchProjectorSettings(userId),
      ),
      prefetchWithCache(
        queryKeys.reflections(userId),
        cacheKeys.reflections,
        () => fetchReflections(userId),
      ),
      prefetchWithCache(
        queryKeys.monthlyPlan(userId, currentMonth, "personal"),
        cacheKeys.monthlyPlan(currentMonth, "personal"),
        () => fetchMonthlyPlan(userId, currentMonth, "personal"),
      ),
      prefetchWithCache(
        queryKeys.planTemplates(userId),
        cacheKeys.planTemplates,
        () => fetchPlanTemplates(userId),
      ),
    ]);
  }, [effectiveUserId, isReadOnlyViewer, queryClient, user?.id]);

  const addMutation = useMutation({
    mutationFn: (transaction: Omit<Transaction, "id">) => {
      assertCanMutate(isReadOnlyViewer);
      return addTransaction(user?.id, transaction);
    },
    onSuccess: (newTx) => {
      setTransactions((current) => {
        const next = [newTx, ...current.filter((t) => t.id !== newTx.id)];
        transactionsRef.current = next;
        if (user?.id) {
          queryClient.setQueryData(queryKeys.transactions(user.id), next);
          writeQueryCache(user.id, cacheKeys.transactions, next);
        }
        return next;
      });
      setTransactionsLoading(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      transaction,
    }: {
      id: string;
      transaction: Partial<Transaction>;
    }) => {
      assertCanMutate(isReadOnlyViewer);
      return updateTransaction(user?.id, id, transaction);
    },
    onSuccess: (_, variables) => {
      setTransactions((current) => {
        const next = current.map((t) => {
          if (t.id !== variables.id) return t;
          const merged = { ...t, ...variables.transaction };
          const dateValue =
            variables.transaction.transactionDate ??
            variables.transaction.date ??
            t.transactionDate ??
            t.date;
          return {
            ...merged,
            date: dateValue,
            transactionDate: dateValue,
          };
        });
        transactionsRef.current = next;
        if (user?.id) {
          queryClient.setQueryData(queryKeys.transactions(user.id), next);
          writeQueryCache(user.id, cacheKeys.transactions, next);
        }
        return next;
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      assertCanMutate(isReadOnlyViewer);
      return deleteTransaction(user?.id, id);
    },
    onSuccess: (_, id) => {
      setTransactions((current) => {
        const next = current.filter((t) => t.id !== id);
        transactionsRef.current = next;
        if (user?.id) {
          queryClient.setQueryData(queryKeys.transactions(user.id), next);
          writeQueryCache(user.id, cacheKeys.transactions, next);
        }
        return next;
      });
      // Drop the friend split (if any) that pointed at this transaction so
      // Friends / Friend detail don't keep showing a ghost balance.
      if (user?.id) {
        queryClient.setQueryData(
          queryKeys.allFriendSplits(user.id),
          (current: FriendSplit[] | undefined) =>
            (current ?? []).filter((split) => split.transactionId !== id),
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.allFriendSplits(user.id),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.allFriendSettlements(user.id),
        });
      }
    },
  });

  const reloadTransactions = useCallback(async () => {
    if (!effectiveUserId) return;

    setTransactionsLoading(true);
    setTransactionsError(null);

    try {
      const fetched = await fetchTransactions(effectiveUserId);
      const cleaned = filterViewerTransactions(withoutMockTransactions(fetched));
      transactionsRef.current = cleaned;
      setTransactions(cleaned);
      queryClient.setQueryData(queryKeys.transactions(effectiveUserId), cleaned);
      if (cleaned.length === 0) {
        removeQueryCache(effectiveUserId, cacheKeys.transactions);
      } else {
        writeQueryCache(effectiveUserId, cacheKeys.transactions, cleaned);
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      setTransactionsError(
        error instanceof Error ? error : new Error("Failed to reload transactions"),
      );
    } finally {
      setTransactionsLoading(false);
    }
  }, [effectiveUserId, filterViewerTransactions, queryClient]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      transactions,
      transactionsLoading,
      transactionsError,
      outings,
      outingsLoading,
      addTransaction: addMutation.mutateAsync,
      updateTransaction: updateMutation.mutateAsync,
      deleteTransaction: deleteMutation.mutateAsync,
      addOuting: async (outing) => {
        assertCanMutate(isReadOnlyViewer);
        // Only one active outing at a time (matches mobile).
        if (outing.status === "active") {
          const hasActive = outings.some(
            (o) => o.status === "active" && o.isActive !== false,
          );
          if (hasActive) {
            throw new Error(
              "An outing is already active. End it before creating another.",
            );
          }
        }
        const saved = await saveOuting(user?.id, {
          ...outing,
          id: crypto.randomUUID(),
          userId: user?.id,
        });
        // Keep in-memory list in sync so /outings/[id] finds the new row
        // immediately (don't wait for realtime).
        setOutings((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        queryClient.setQueryData<Outing[]>(
          queryKeys.outings(user?.id),
          (current = []) => [
            saved,
            ...current.filter((item) => item.id !== saved.id),
          ],
        );
        return saved;
      },
      updateOuting: async (outing) => {
        assertCanMutate(isReadOnlyViewer);
        const saved = await saveOuting(user?.id, outing);
        setOutings((current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        );
        queryClient.setQueryData<Outing[]>(
          queryKeys.outings(user?.id),
          (current = []) =>
            current.map((item) => (item.id === saved.id ? saved : item)),
        );
        return saved;
      },
      removeOuting: async (outingId) => {
        assertCanMutate(isReadOnlyViewer);
        await deleteOuting(user?.id, outingId);
        setOutings((current) =>
          current.filter((item) => item.id !== outingId),
        );
        queryClient.setQueryData<Outing[]>(
          queryKeys.outings(user?.id),
          (current = []) => current.filter((item) => item.id !== outingId),
        );
      },
      isTransactionsMutating:
        addMutation.isPending ||
        updateMutation.isPending ||
        deleteMutation.isPending,
      lastSyncedAt,
      reloadTransactions,
    }),
    [
      addMutation,
      deleteMutation,
      lastSyncedAt,
      outings,
      outingsLoading,
      queryClient,
      reloadTransactions,
      transactions,
      transactionsError,
      transactionsLoading,
      updateMutation,
      isReadOnlyViewer,
      user?.id,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return context;
}