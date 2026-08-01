"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeToFilteredTransactions,
  subscribeToTransactions,
} from "@/lib/supabase-data";
import {
  applyClientTransactionFilters,
  canUseServerTransactionQuery,
  toServerTransactionFilters,
} from "@/lib/transactions-query";
import { filterTransactions } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";
import type { GlobalFilters, Transaction } from "@/types";

export function useFilteredTransactions(filters: GlobalFilters) {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [usesClientFallback, setUsesClientFallback] = useState(false);
  const fallbackRef = useRef(false);

  const serverFilters = useMemo(
    () => toServerTransactionFilters(filters),
    [
      filters.dateFrom,
      filters.dateTo,
      filters.transactionType,
      filters.account,
      filters.source,
      filters.categories.join("|"),
    ],
  );

  const useServerQuery = canUseServerTransactionQuery(filters);

  useEffect(() => {
    fallbackRef.current = false;
    setUsesClientFallback(false);
  }, [
    serverFilters.dateFrom,
    serverFilters.dateTo,
    serverFilters.transactionType,
    serverFilters.account,
    serverFilters.source,
    serverFilters.categories.join("|"),
  ]);

  useEffect(() => {
    if (isConfigured && !isReady) return;

    const userId = effectiveUserId;
    if (!userId) {
      setTransactions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let fallbackUnsubscribe: (() => void) | undefined;

    function publish(nextTransactions: Transaction[]) {
      const result =
        useServerQuery && !fallbackRef.current
          ? applyClientTransactionFilters(nextTransactions, filters)
          : filterTransactions(nextTransactions, filters);
      setTransactions(result);
      setIsLoading(false);
    }

    function startFallbackSubscription() {
      if (fallbackRef.current) return;
      fallbackRef.current = true;
      setUsesClientFallback(true);
      fallbackUnsubscribe = subscribeToTransactions(
        userId,
        publish,
        (subscribeError) => {
          setError(subscribeError);
          setIsLoading(false);
        },
      );
    }

    if (!useServerQuery) {
      startFallbackSubscription();
      return () => fallbackUnsubscribe?.();
    }

    const unsubscribe = subscribeToFilteredTransactions(
      userId,
      serverFilters,
      publish,
      () => {
        startFallbackSubscription();
      },
    );

    return () => {
      unsubscribe();
      fallbackUnsubscribe?.();
    };
  }, [
    filters,
    serverFilters,
    isConfigured,
    isReady,
    useServerQuery,
    effectiveUserId,
  ]);

  return {
    transactions,
    isLoading,
    error,
    usesClientFallback,
    isRealtime: Boolean(effectiveUserId && isConfigured),
  };
}