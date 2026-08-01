"use client";

import { useMemo } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useCategories } from "@/hooks/useCategories";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { filterAnalyticsTransactions } from "@/lib/analytics";
import { buildDashboardData } from "@/lib/dashboard";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useOutings } from "@/hooks/useOutings";
import { buildTransactionsListRows } from "@/lib/outings";
import { narrowTransactionsToFilter } from "@/lib/utils";
import type { AnalyticsFilters } from "@/types";

export function useDashboardData() {
  const { settings } = useUserSettings();
  const includeOutingExpenses = settings.includeOutingExpenses ?? true;
  const { transactions: rawTransactions, isLoading: transactionsLoading, error } = useTransactions();
  const { expenses: outingExpenses } = useAllOutingExpenses();
  const { outings } = useOutings();

  const transactions = useMemo(() => {
    if (includeOutingExpenses) {
      return buildTransactionsListRows(rawTransactions, outingExpenses, outings);
    }
    return rawTransactions.filter(
      (tx) => !tx.outingId && !tx.tags?.includes("outing-analytics"),
    );
  }, [rawTransactions, outingExpenses, outings, includeOutingExpenses]);

  const { accounts: allAccounts } = useAccounts();
  // Archived accounts are soft-deleted, not gone — exclude their balances
  // from net worth the same way the Wealth page does.
  const accounts = useMemo(
    () => allAccounts.filter((account) => account.isActive !== false),
    [allAccounts],
  );
  const { categories } = useCategories();
  const { purposes } = usePurposes();
  const { filters } = useGlobalFilters();

  const isInitialLoading = transactionsLoading && rawTransactions.length === 0;

  const unlinkedOutingExpenses = useMemo(
    () =>
      includeOutingExpenses
        ? outingExpenses.filter(
            (e) => !e.linkedTransactionId && e.source !== "bank-detected",
          )
        : [],
    [outingExpenses, includeOutingExpenses],
  );

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
    return filterAnalyticsTransactions(transactions, analyticsFilters, { purposes });
  }, [filters, transactions, purposes]);

  // Purpose/Category-narrowed but NOT date-restricted — Net Worth and any
  // other "current standing" (not period) figure must reflect the active
  // filter without being clipped to the selected date range.
  const purposeFilter = useMemo(
    () => ({ purposeId: filters.purposeId, categories: filters.categories }),
    [filters.purposeId, filters.categories],
  );
  const netWorthTransactions = useMemo(
    () => narrowTransactionsToFilter(transactions, purposeFilter, purposes),
    [transactions, purposeFilter, purposes],
  );

  const data = useMemo(
    () =>
      buildDashboardData(
        filteredTransactions,
        transactions,
        accounts,
        categories,
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        filters.dashboardMonth,
        unlinkedOutingExpenses,
        { includeOutingExpenses },
        purposeFilter,
        purposes,
      ),
    [
      accounts,
      categories,
      filteredTransactions,
      filters.dashboardMonth,
      filters.dateFrom,
      filters.dateTo,
      transactions,
      unlinkedOutingExpenses,
      includeOutingExpenses,
      purposeFilter,
      purposes,
    ],
  );

  return {
    data,
    isLoading: isInitialLoading,
    error,
    /** Manual outing cash not on the ledger — pass into KPI cash/NW. */
    unlinkedOutingExpenses,
    /** Purpose/Category-narrowed, date-unrestricted ledger — same set Net
     * Worth is built from; Cash in Hand / Bank Balance cards should use it
     * too so they agree with the Net Worth KPI under the active filter. */
    netWorthTransactions,
  };
}