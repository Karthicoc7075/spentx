"use client";

import { useMemo } from "react";
import { useCategories } from "@/hooks/useCategories";
import { useAnalyticsOutingContext } from "@/hooks/useAnalyticsOutingContext";
import { useUserSettings } from "@/hooks/useUserSettings";

import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import {
  buildActiveFilterChips,
  computeAnalyticsFilterSummary,
  countActiveFilters,
  filtersForCategoryBreakdown,
  filtersForTopMerchants,
  prepareAnalyticsTransactions,
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
  const { settings } = useUserSettings();
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

  // Fold outing spend into Analysis only if includeOutingExpenses is enabled
  const analyticsLedger = useMemo(
    () =>
      prepareAnalyticsTransactions(
        transactions,
        outingContext.outings ?? [],
        outingContext.outingExpenses ?? [],
        settings.includeOutingExpenses ?? true,
      ),
    [transactions, outingContext.outings, outingContext.outingExpenses, settings.includeOutingExpenses],
  );

  const filtered = useMemo(
    () =>
      sortAnalyticsTransactions(
        filterAnalyticsTransactions(analyticsLedger, filters, filterContext),
        filters.sortBy,
      ),
    [analyticsLedger, filters, filterContext],
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
    () => computeTrendData(analyticsLedger, filters, filterContext),
    [analyticsLedger, filters, filterContext],
  );
  const categoryBreakdownScope = useMemo(
    () => filtersForCategoryBreakdown(filters),
    [filters],
  );

  const categoryBreakdownTransactions = useMemo(
    () =>
      filterAnalyticsTransactions(
        analyticsLedger,
        categoryBreakdownScope,
        filterContext,
      ),
    [analyticsLedger, categoryBreakdownScope, filterContext],
  );

  const categoryBreakdown = useMemo(
    () =>
      computeCategoryBreakdown(
        categoryBreakdownTransactions,
        categories,
        analyticsLedger,
        categoryBreakdownScope,
        filterContext,
      ),
    [
      categoryBreakdownTransactions,
      categories,
      analyticsLedger,
      categoryBreakdownScope,
      filterContext,
    ],
  );
  const topMerchantsScope = useMemo(
    () => filtersForTopMerchants(filters),
    [filters],
  );

  const topMerchantsTransactions = useMemo(
    () =>
      filterAnalyticsTransactions(
        analyticsLedger,
        topMerchantsScope,
        filterContext,
      ),
    [analyticsLedger, topMerchantsScope, filterContext],
  );

  const topMerchants = useMemo(
    () => computeTopMerchants(topMerchantsTransactions, categories),
    [topMerchantsTransactions, categories],
  );
  const planVsActual = useMemo(
    () => computePlanVsActual(transactions, plan, purposes, categories, filters.categories),
    [transactions, plan, purposes, categories, filters.categories],
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
    () => computeDetailedStats(analyticsLedger, filtered, plan, filters),
    [analyticsLedger, filtered, plan, filters],
  );

  const monthlyTimeline = useMemo(
    () =>
      computeMonthlyComparisonTimeline(analyticsLedger, filters, filterContext),
    [analyticsLedger, filters, filterContext],
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
    topMerchantsTransactions,
    planVsActual,
    planSummary,
    planAdherence,
    planMonth,
    plan,
    isLoading,
    hasLoaded,
    hasTransactions: analyticsLedger.length > 0 || transactions.length > 0,
    planLoading,
    error,
    monthlyTimeline,
    ...detailedStats,
  };
}