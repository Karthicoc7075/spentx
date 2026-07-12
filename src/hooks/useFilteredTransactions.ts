"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeToFilteredTransactions,
  subscribeToTransactions,
} from "@/lib/firebase";
import {
  applyClientTransactionFilters,
  canUseFirestoreTransactionQuery,
  toFirestoreTransactionFilters,
} from "@/lib/transactions-query";
import { filterTransactions } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { GlobalFilters, Transaction } from "@/types";

export function useFilteredTransactions(filters: GlobalFilters) {
  const { user, isConfigured, isReady } = useAuthReady();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [usesClientFallback, setUsesClientFallback] = useState(false);
  const fallbackRef = useRef(false);

  const firestoreFilters = useMemo(
    () => toFirestoreTransactionFilters(filters),
    [
      filters.dateFrom,
      filters.dateTo,
      filters.transactionType,
      filters.account,
      filters.source,
      filters.categories.join("|"),
    ],
  );

  const useFirestoreQuery = canUseFirestoreTransactionQuery(filters);

  useEffect(() => {
    fallbackRef.current = false;
    setUsesClientFallback(false);
  }, [
    firestoreFilters.dateFrom,
    firestoreFilters.dateTo,
    firestoreFilters.transactionType,
    firestoreFilters.account,
    firestoreFilters.source,
    firestoreFilters.categories.join("|"),
  ]);

  useEffect(() => {
    if (isConfigured && !isReady) return;

    const userId = user?.id;
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
        useFirestoreQuery && !fallbackRef.current
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

    if (!useFirestoreQuery) {
      startFallbackSubscription();
      return () => fallbackUnsubscribe?.();
    }

    const unsubscribe = subscribeToFilteredTransactions(
      userId,
      firestoreFilters,
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
    firestoreFilters,
    isConfigured,
    isReady,
    useFirestoreQuery,
    user?.id,
  ]);

  return {
    transactions,
    isLoading,
    error,
    usesClientFallback,
    isRealtime: Boolean(user?.id && isConfigured),
  };
}