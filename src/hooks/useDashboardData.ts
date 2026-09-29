"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useCategories } from "@/hooks/useCategories";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { filterAnalyticsTransactions } from "@/lib/analytics";
import { buildDashboardData } from "@/lib/dashboard";
import { queryKeys } from "@/lib/query-keys";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useOutings } from "@/hooks/useOutings";
import { buildTransactionsListRows } from "@/lib/outings";
import { fetchSharedPersonalAccounts } from "@/lib/supabase-data";
import { narrowTransactionsToFilter } from "@/lib/utils";
import { sumPeriodOutingSpend } from "@/lib/period-totals";
import { useShareSession } from "@/providers/share-provider";
import type { AnalyticsFilters, Purpose, Transaction } from "@/types";

function isPersonalSharePurpose(
  share: { purposeId: string; purposeName: string },
  purposes: Purpose[],
) {
  if (share.purposeName.trim().toLowerCase() === "personal") return true;
  const purpose = purposes.find((item) => item.id === share.purposeId);
  if (!purpose) return false;
  return (
    purpose.isDefault === true || purpose.name.trim().toLowerCase() === "personal"
  );
}

export function useDashboardData() {
  const { settings } = useUserSettings();
  const includeOutingExpenses = true;
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

  const { accounts: allAccounts, isLoading: accountsLoading } = useAccounts();
  // Archived accounts are soft-deleted, not gone — exclude their balances
  // from net worth the same way the Wealth page does.
  const accounts = useMemo(
    () => allAccounts.filter((account) => account.isActive !== false),
    [allAccounts],
  );
  const { categories } = useCategories();
  const { purposes } = usePurposes();
  const { filters } = useGlobalFilters();
  const share = useShareSession();
  const queryClient = useQueryClient();
  // Share viewers have no auth.uid(), so the accounts query comes back empty
  // and Personal net worth fell through to income − expense, dropping every
  // opening balance. Only the Personal share needs those balances.
  const personalShare = share ? isPersonalSharePurpose(share, purposes) : false;
  const sharedAccountsQuery = useQuery({
    queryKey: queryKeys.sharedPersonalAccounts(share?.token ?? ""),
    queryFn: () => fetchSharedPersonalAccounts(share!.token),
    enabled: personalShare && !accountsLoading && accounts.length === 0,
  });
  const netWorthAccounts = useMemo(() => {
    if (!personalShare || accounts.length > 0) return accounts;
    return sharedAccountsQuery.data ?? [];
  }, [accounts, personalShare, sharedAccountsQuery.data]);
  // useTransactions collapses rows that share an id. A Personal share is one
  // row per split, often with the same transaction id, so that collapse
  // under-counts Personal net worth. The query cache still has every split.
  const netWorthLedger = useMemo(() => {
    if (!personalShare || !share) return transactions;
    const raw = queryClient.getQueryData<Transaction[]>(
      queryKeys.sharedTransactions(share.token),
    );
    if (!raw) return transactions;
    return buildTransactionsListRows(raw, outingExpenses, outings);
  }, [outingExpenses, outings, personalShare, queryClient, share, transactions]);

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

  const effectivePurposeId = share?.purposeId || filters.purposeId;

  const filteredTransactions = useMemo(() => {
    const analyticsFilters: AnalyticsFilters = {
      ...filters,
      purposeId: effectivePurposeId,
      purpose: effectivePurposeId,
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
  }, [effectivePurposeId, filters, transactions, purposes]);

  // Purpose/Category-narrowed but NOT date-restricted — Net Worth and any
  // other "current standing" (not period) figure must reflect the active
  // filter without being clipped to the selected date range.
  const purposeFilter = useMemo(
    () => ({ purposeId: effectivePurposeId, categories: filters.categories }),
    [effectivePurposeId, filters.categories],
  );
  const netWorthTransactions = useMemo(
    () => narrowTransactionsToFilter(transactions, purposeFilter, purposes),
    [transactions, purposeFilter, purposes],
  );

  const periodOutingSpend = useMemo(() => {
    return sumPeriodOutingSpend(rawTransactions, outingExpenses, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  }, [rawTransactions, outingExpenses, filters.dateFrom, filters.dateTo]);

  const data = useMemo(
    () =>
      buildDashboardData(
        filteredTransactions,
        netWorthLedger,
        netWorthAccounts,
        categories,
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        filters.dashboardMonth,
        unlinkedOutingExpenses,
        { includeOutingExpenses, periodOutingSpend },
        purposeFilter,
        purposes,
      ),
    [
      categories,
      filteredTransactions,
      filters.dashboardMonth,
      filters.dateFrom,
      filters.dateTo,
      netWorthAccounts,
      netWorthLedger,
      unlinkedOutingExpenses,
      includeOutingExpenses,
      periodOutingSpend,
      purposeFilter,
      purposes,
    ],
  );

  // Hold only the Personal Net Worth figure until opening balances arrive.
  // Other dashboard numbers keep the existing loading flag.
  const personalNetWorthLoading =
    personalShare &&
    accounts.length === 0 &&
    (accountsLoading ||
      (sharedAccountsQuery.data === undefined && !sharedAccountsQuery.isError));

  return {
    data,
    accounts: netWorthAccounts,
    isLoading: isInitialLoading,
    personalNetWorthLoading,
    error,
    /** Manual outing cash not on the ledger — pass into KPI cash/NW. */
    unlinkedOutingExpenses,
    /** Purpose/Category-narrowed, date-unrestricted ledger — same set Net
     * Worth is built from; Cash in Hand / Bank Balance cards should use it
     * too so they agree with the Net Worth KPI under the active filter. */
    netWorthTransactions,
  };
}