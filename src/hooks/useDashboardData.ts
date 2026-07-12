"use client";

import { useMemo } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useTransactions } from "@/hooks/useTransactions";
import { filterAnalyticsTransactions } from "@/lib/analytics";
import { buildDashboardData } from "@/lib/dashboard";
import type { AnalyticsFilters } from "@/types";

export function useDashboardData() {
  const { transactions, isLoading: transactionsLoading, error } = useTransactions();
  const { accounts: allAccounts } = useAccounts();
  // Archived accounts are soft-deleted, not gone — exclude their balances
  // from net worth the same way the Wealth page does.
  const accounts = useMemo(
    () => allAccounts.filter((account) => account.is_active !== false),
    [allAccounts],
  );
  const { categories } = useCategories();
  const { filters } = useGlobalFilters();

  const isInitialLoading = transactionsLoading && transactions.length === 0;

  const filteredTransactions = useMemo(() => {
    const analyticsFilters: AnalyticsFilters = {
      ...filters,
      purpose: filters.purposeId,
      merchant: "",
      transactionStatus: "",
      tags: [],
      categoryGroup: "",
      sortBy: "newest",
      outingType: "",
      outingWithWhom: "",
      outingStatus: "",
      trendGranularity: "daily",
      datePreset: "custom",
      compareMode: "",
    };
    return filterAnalyticsTransactions(transactions, analyticsFilters);
  }, [filters, transactions]);

  const data = useMemo(
    () =>
      buildDashboardData(
        filteredTransactions,
        transactions,
        accounts,
        categories,
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        filters.dashboardMonth,
      ),
    [
      accounts,
      categories,
      filteredTransactions,
      filters.dashboardMonth,
      filters.dateFrom,
      filters.dateTo,
      transactions,
    ],
  );

  return {
    data,
    isLoading: isInitialLoading,
    error,
  };
}