"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { sumInvestments } from "@/lib/investments";
import { fetchInvestmentTotal } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Total investment cost = sum of expense transactions in investment
 * categories (normal Add expense · category Investment). No separate entity.
 */
export function useInvestmentTotal() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { transactions } = useTransactions();
  const { categories } = useCategories();

  // Client sum is source of truth for UI (always matches ledger).
  const fromLedger = useMemo(
    () => sumInvestments(transactions, categories),
    [transactions, categories],
  );

  // Optional server view as backup when local list is still empty.
  const query = useQuery({
    queryKey: queryKeys.investmentTotal(user?.id),
    queryFn: () => fetchInvestmentTotal(user?.id),
    enabled: (isReady || !isConfigured) && transactions.length === 0,
  });

  return {
    totalInvested: transactions.length > 0 ? fromLedger : (query.data ?? fromLedger),
    isLoading: transactions.length === 0 && query.isPending,
  };
}
