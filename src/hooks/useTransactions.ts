"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchTransactions } from "@/lib/firebase";
import { withoutMockTransactions } from "@/lib/mock-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useAppData } from "@/providers/app-data-provider";
import type { Transaction } from "@/types";

function mergeTransactions(...groups: Transaction[][]) {
  const merged = new Map<string, Transaction>();

  for (const group of groups) {
    for (const transaction of group) {
      merged.set(transaction.id, transaction);
    }
  }

  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function useTransactions() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();
  const {
    transactions: liveTransactions,
    transactionsLoading: liveLoading,
    transactionsError,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    isTransactionsMutating,
    reloadTransactions,
    lastSyncedAt,
  } = useAppData();

  const query = useQuery({
    queryKey: queryKeys.transactions(user?.id),
    queryFn: async () =>
      withoutMockTransactions(await fetchTransactions(user?.id)),
    enabled: Boolean(user?.id && (isReady || !isConfigured)),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const transactions = useMemo(
    () => mergeTransactions(query.data ?? [], liveTransactions),
    [liveTransactions, query.data],
  );

  return {
    transactions,
    error: query.error ?? transactionsError,
    isLoading: transactions.length === 0 && (query.isPending || liveLoading),
    isSyncing: query.isFetching || liveLoading,
    hasLoaded: !query.isPending || query.data !== undefined || liveTransactions.length > 0,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    isMutating: isTransactionsMutating,
    reloadTransactions: async () => {
      await reloadTransactions();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.transactions(user?.id),
      });
    },
    lastSyncedAt,
    refetchTransactions: query.refetch,
  };
}