"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchSharedTransactions, fetchTransactions } from "@/lib/supabase-data";
import { withoutMockTransactions } from "@/lib/mock-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useAppData } from "@/providers/app-data-provider";
import { useShareSession } from "@/providers/share-provider";
import { useViewerAccess } from "@/providers/viewer-provider";
import { compareTransactionsNewestFirst } from "@/lib/utils";
import type { Transaction } from "@/types";

function mergeTransactions(...groups: Transaction[][]) {
  const merged = new Map<string, Transaction>();

  for (const group of groups) {
    for (const transaction of group) {
      merged.set(transaction.id, transaction);
    }
  }

  return [...merged.values()].sort(compareTransactionsNewestFirst);
}

export function useTransactions() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const share = useShareSession();
  const effectiveUserId = dataOwnerId ?? user?.id;
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
    queryKey: share
      ? queryKeys.sharedTransactions(share.token)
      : queryKeys.transactions(effectiveUserId),
    queryFn: async () =>
      share
        ? fetchSharedTransactions(share.token, share.purposeId)
        : withoutMockTransactions(await fetchTransactions(effectiveUserId)),
    enabled: Boolean(share) || Boolean(effectiveUserId && (isReady || !isConfigured)),
    refetchOnMount: "always",
    refetchInterval: share ? 45_000 : undefined,
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
        queryKey: queryKeys.transactions(effectiveUserId),
      });
    },
    lastSyncedAt,
    refetchTransactions: query.refetch,
  };
}