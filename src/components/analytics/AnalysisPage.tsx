"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AnalysisDateFilter,
  applyAnalysisDatePreset,
} from "@/components/analytics/AnalysisDateFilter";
import { CategoryBreakdown } from "@/components/analytics/CategoryBreakdown";
import { ContributorBreakdown } from "@/components/analytics/ContributorBreakdown";
import { MonthlyComparisonTimeline } from "@/components/analytics/MonthlyComparisonTimeline";
import { PlanVsActualTable } from "@/components/analytics/PlanVsActualTable";

import { SmartViewsPanel } from "@/components/analytics/SmartViewsPanel";
import { TopMerchantsTable } from "@/components/analytics/TopMerchantsTable";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useCategories } from "@/hooks/useCategories";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { useOutings } from "@/hooks/useOutings";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  computeContributorBreakdown,
  formatAnalyticsPeriodLabel,
} from "@/lib/analytics";
import { computeNetBalancesByMember } from "@/lib/outings";
import { downloadReportPdf } from "@/lib/pdf";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { buildFinancialReport } from "@/lib/reports";
import { fetchOutingExpenses, fetchOutingSettlements } from "@/lib/supabase-data";
import { downloadCsv, toCsv } from "@/lib/utils";
import { useViewerAccess } from "@/providers/viewer-provider";
import type { AnalyticsFilters } from "@/types";

export function AnalysisPage() {
  const { isReadOnlyViewer } = useViewerAccess();
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { categories } = useCategories();
  const { transactions } = useTransactions();
  const { outings } = useOutings();
  const { appliedFiltersForData, applyPartialFilters, removeFilterChip, resetFilters } =
    useAnalyticsFilters();
  const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null);
  const [highlightedMerchant, setHighlightedMerchant] = useState<string | null>(null);

  // Settlements are a running balance across all outings, not scoped to the
  // page's date/purpose filters — and outing data is owner-wide, unrelated
  // to a single shared purpose, so this section is owner-only (see render
  // below). Reuses the exact balance computation FriendsPage already uses.
  const { data: outingExpenses = [] } = useQuery({
    queryKey: ["allOutingExpenses", user?.id],
    queryFn: () => fetchOutingExpenses(user?.id),
    enabled: !isReadOnlyViewer && Boolean(user?.id),
  });
  const { data: outingSettlements = [] } = useQuery({
    queryKey: ["allOutingSettlements", user?.id],
    queryFn: () => fetchOutingSettlements(user?.id),
    enabled: !isReadOnlyViewer && Boolean(user?.id),
  });
  const settlementBalances = useMemo(
    () => computeNetBalancesByMember(outings, outingExpenses, outingSettlements),
    [outings, outingExpenses, outingSettlements],
  );

  const {
    filtered,
    categoryBreakdown,
    planVsActual,
    monthlyTimeline,
    planMonth,
    isLoading,
    hasLoaded,
    hasTransactions,
    error,
    activeFilterChips,
    activeFilterCount,
    topMerchants,
    trend,
  } = useAnalyticsData(appliedFiltersForData);

  const cashFlowTrendData = useMemo(
    () =>
      (trend?.current ?? []).map((point) => ({
        day: point.label,
        label: point.label,
        income: point.income ?? 0,
        expense: point.expense ?? 0,
      })),
    [trend],
  );

  const planPurposeId = appliedFiltersForData.purposeId || PERSONAL_PURPOSE_ID;
  const { data: plan } = useMonthlyPlanQuery(planMonth, planPurposeId);

  const contributorBreakdown = useMemo(
    () => computeContributorBreakdown(filtered),
    [filtered],
  );

  const merchantsPeriodLabel = formatAnalyticsPeriodLabel(appliedFiltersForData);

  // Shown whenever more than one contributor has income to attribute — not
  // tied to a specific purpose name, since contributors are purpose-agnostic.
  const showContributors = contributorBreakdown.length > 1;

  function handleDatePresetChange(preset: AnalyticsFilters["datePreset"]) {
    applyPartialFilters(applyAnalysisDatePreset(preset));
    setHighlightedCategory(null);
    setHighlightedMerchant(null);
  }

  function handlePurposeChange(purposeId: string) {
    const purpose = purposes.find((item) => item.id === purposeId);
    applyPartialFilters({
      purposeId,
      purpose: purpose?.name ?? "",
    });
    setHighlightedCategory(null);
    setHighlightedMerchant(null);
  }

  function handleCategorySelect(category: string) {
    setHighlightedCategory((current) => (current === category ? null : category));
    setHighlightedMerchant(null);
  }

  function handleMerchantSelect(merchant: string) {
    const isDeselect = highlightedMerchant === merchant;
    setHighlightedMerchant(isDeselect ? null : merchant);
    applyPartialFilters({
      merchant: isDeselect ? "" : merchant,
    });
  }

  function handleExportPdf() {
    const report = buildFinancialReport({
      transactions,
      categories,
      plan,
      type: "custom",
      dateFrom: appliedFiltersForData.dateFrom,
      dateTo: appliedFiltersForData.dateTo,
    });
    downloadReportPdf(report);
  }

  const showEmptyHint = hasLoaded && !hasTransactions;

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Understand where your money goes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={isLoading || filtered.length === 0}
            variant="outline"
            onClick={() => downloadCsv("spentx-analysis.csv", toCsv(filtered, { purposes }))}
          >
            Export CSV
          </Button>
          <Button
            disabled={isLoading || filtered.length === 0}
            variant="outline"
            onClick={handleExportPdf}
          >
            Export PDF
          </Button>
        </div>
      </div>

      <div className="sx-surface flex flex-wrap items-center gap-3 p-4">
        <AnalysisDateFilter
          preset={appliedFiltersForData.datePreset}
          onPresetChange={handleDatePresetChange}
        />
        
        {!isReadOnlyViewer ? (<>
          <PurposeFilterChips
          value={appliedFiltersForData.purposeId}
          onChange={handlePurposeChange}
        />
          <SmartViewsPanel
            filters={appliedFiltersForData}
            onApplyPartial={(partial) => {
              applyPartialFilters(partial);
              setHighlightedCategory(null);
              setHighlightedMerchant(null);
            }}
          /></>
        ) : null}
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Active filters:
          </span>
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium hover:bg-muted"
              onClick={() => {
                removeFilterChip(chip.key);
                setHighlightedCategory(null);
                setHighlightedMerchant(null);
              }}
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
          {activeFilterChips.length > 1 ? (
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                resetFilters();
                setHighlightedCategory(null);
                setHighlightedMerchant(null);
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Something went wrong. We couldn&apos;t load your data. Try refreshing the page.
        </div>
      ) : null}

      {showEmptyHint ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions yet. Add expenses or income from the dashboard to see analysis.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-72" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Trend</CardTitle>
              <p className="text-sm text-muted-foreground">
                Income vs expense for {merchantsPeriodLabel}, including outing
                totals.
              </p>
            </CardHeader>
            <CardContent>
              {cashFlowTrendData.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No cash-flow activity in this period yet.
                </p>
              ) : (
                <div className="h-72">
                  <TrendChart data={cashFlowTrendData} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Spend by category for {merchantsPeriodLabel}. Outings group as{" "}
                  <span className="font-medium text-foreground">
                    Trip, Temple, Restaurant…
                  </span>
                </p>
              </CardHeader>
              <CardContent>
                <CategoryBreakdown
                  data={categoryBreakdown}
                  onCategoryClick={handleCategorySelect}
                />
              </CardContent>
            </Card>

            <TopMerchantsTable
              activeMerchant={highlightedMerchant}
              merchants={topMerchants}
              periodLabel={merchantsPeriodLabel}
              onMerchantClick={handleMerchantSelect}
            />
          </div>

          <MonthlyComparisonTimeline data={monthlyTimeline ?? []} />

          {showContributors ? (
            <ContributorBreakdown contributors={contributorBreakdown} />
          ) : null}

          {isReadOnlyViewer ? null : (
            <PlanVsActualTable planMonth={planMonth} rows={planVsActual} />
          )}
        </>
      )}
    </div>
  );
}