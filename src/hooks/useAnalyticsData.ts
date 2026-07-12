"use client";

import { useMemo } from "react";
import { useCategories } from "@/hooks/useCategories";
import { useAnalyticsOutingContext } from "@/hooks/useAnalyticsOutingContext";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import {
  buildActiveFilterChips,
  computeAnalyticsFilterSummary,
  countActiveFilters,
  sortAnalyticsTransactions,
} from "@/lib/analytics-filters";
import {
  computeCategoryBreakdown,
  computeHeroStats,
  computePlanAdherenceOverTime,
  computePlanComparisonSummary,
  computePlanVsActual,
  computeTopMerchants,
  computeTrendData,
  filterAnalyticsTransactions,
  getPlanMonthFromFilters,
  computeDetailedStats,
  computeMonthlyComparisonTimeline,
} from "@/lib/analytics";
import type { AnalyticsFilters } from "@/types";

export function useAnalyticsData(filters: AnalyticsFilters) {
  const {
    transactions,
    isLoading: transactionsLoading,
    hasLoaded,
    error,
  } = useTransactions();
  const { categories } = useCategories();
  const { purposes } = usePurposes();
  const outingContext = useAnalyticsOutingContext();
  const filterContext = useMemo(
    () => ({ ...outingContext, purposes }),
    [outingContext, purposes],
  );
  const planMonth = getPlanMonthFromFilters(filters);
  const planPurposeId = filters.purposeId || PERSONAL_PURPOSE_ID;
  const { data: plan, isLoading: planLoading } = useMonthlyPlanQuery(
    planMonth,
    planPurposeId,
  );

  const filtered = useMemo(
    () =>
      sortAnalyticsTransactions(
        filterAnalyticsTransactions(transactions, filters, filterContext),
        filters.sortBy,
      ),
    [transactions, filters, filterContext],
  );

  const filterSummary = useMemo(
    () => computeAnalyticsFilterSummary(filtered, outingContext),
    [filtered, outingContext],
  );

  const activeFilterChips = useMemo(
    () => buildActiveFilterChips(filters, purposes),
    [filters, purposes],
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters],
  );

  const heroStats = useMemo(() => computeHeroStats(filtered), [filtered]);
  const trend = useMemo(
    () => computeTrendData(transactions, filters, filterContext),
    [transactions, filters, filterContext],
  );
  const categoryBreakdown = useMemo(
    () =>
      computeCategoryBreakdown(
        filtered,
        categories,
        transactions,
        filters,
        filterContext,
      ),
    [filtered, categories, transactions, filters, filterContext],
  );
  const topMerchants = useMemo(() => computeTopMerchants(filtered), [filtered]);
  const planVsActual = useMemo(
    () => computePlanVsActual(filtered, plan),
    [filtered, plan],
  );
  const planSummary = useMemo(
    () => computePlanComparisonSummary(filtered, plan),
    [filtered, plan],
  );
  const planAdherence = useMemo(
    () => computePlanAdherenceOverTime(filtered, plan, filters),
    [filtered, plan, filters],
  );

  const detailedStats = useMemo(
    () => computeDetailedStats(transactions, filtered, plan, filters),
    [transactions, filtered, plan, filters],
  );

  const monthlyTimeline = useMemo(
    () => computeMonthlyComparisonTimeline(transactions, filters, filterContext),
    [transactions, filters, filterContext],
  );

  const isLoading = transactionsLoading && transactions.length === 0;

  return {
    transactions,
    filtered,
    filterSummary,
    activeFilterChips,
    activeFilterCount,
    heroStats,
    trend,
    categoryBreakdown,
    topMerchants,
    planVsActual,
    planSummary,
    planAdherence,
    planMonth,
    plan,
    isLoading,
    hasLoaded,
    hasTransactions: transactions.length > 0,
    planLoading,
    error,
    monthlyTimeline,
    ...detailedStats,
  };
}