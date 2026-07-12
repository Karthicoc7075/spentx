"use client";

import { useMemo, useState } from "react";
import {
  AnalysisDateFilter,
  applyAnalysisDatePreset,
} from "@/components/analytics/AnalysisDateFilter";
import { BudgetVsActualTable } from "@/components/analytics/BudgetVsActualTable";
import { CategoryBreakdown } from "@/components/analytics/CategoryBreakdown";
import { ContributorBreakdown } from "@/components/analytics/ContributorBreakdown";
import { MonthlyComparisonTimeline } from "@/components/analytics/MonthlyComparisonTimeline";
import { SmartViewsControl } from "@/components/analytics/SmartViewsControl";
import { TopCategoriesTable } from "@/components/analytics/TopCategoriesTable";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { useAnalyticsFilters } from "@/hooks/useAnalyticsFilters";
import { useCategories } from "@/hooks/useCategories";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { computeContributorBreakdown } from "@/lib/analytics";
import { downloadReportPdf } from "@/lib/pdf";
import { isHomeFamilyPurpose, PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { buildFinancialReport } from "@/lib/reports";
import { downloadCsv, toCsv } from "@/lib/utils";
import type { AnalyticsFilters } from "@/types";

export function AnalysisPage() {
  const { purposes } = usePurposes();
  const { categories } = useCategories();
  const { transactions } = useTransactions();
  const {
    appliedFiltersForData,
    applyPartialFilters,
    applySavedView,
    saveCurrentView,
    deleteSavedView,
    savedViews,
    presetViews,
  } = useAnalyticsFilters();
  const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null);

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
  } = useAnalyticsData(appliedFiltersForData);

  const planPurposeId = appliedFiltersForData.purposeId || PERSONAL_PURPOSE_ID;
  const { data: plan } = useMonthlyPlanQuery(planMonth, planPurposeId);

  const contributorBreakdown = useMemo(
    () => computeContributorBreakdown(filtered),
    [filtered],
  );

  const visibleCategories = useMemo(() => {
    if (!highlightedCategory) return categoryBreakdown;
    return categoryBreakdown.filter((item) => item.name === highlightedCategory);
  }, [categoryBreakdown, highlightedCategory]);

  const showHomeFamilyContributors = appliedFiltersForData.purposeId
    ? isHomeFamilyPurpose(appliedFiltersForData.purposeId, purposes)
    : false;

  function handleDatePresetChange(preset: AnalyticsFilters["datePreset"]) {
    applyPartialFilters(applyAnalysisDatePreset(preset));
    setHighlightedCategory(null);
  }

  function handlePurposeChange(purposeId: string) {
    const purpose = purposes.find((item) => item.id === purposeId);
    applyPartialFilters({
      purposeId,
      purpose: purpose?.name ?? "",
    });
    setHighlightedCategory(null);
  }

  function handleCategorySelect(category: string) {
    setHighlightedCategory((current) => (current === category ? null : category));
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
            onClick={() => downloadCsv("spentx-analysis.csv", toCsv(filtered))}
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

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <AnalysisDateFilter
          preset={appliedFiltersForData.datePreset}
          onPresetChange={handleDatePresetChange}
        />
        <PurposeFilterChips
          value={appliedFiltersForData.purposeId}
          onChange={handlePurposeChange}
        />
        <SmartViewsControl
          presetViews={presetViews}
          savedViews={savedViews}
          onApply={(view) => {
            applySavedView(view);
            setHighlightedCategory(null);
          }}
          onDelete={deleteSavedView}
          onSave={saveCurrentView}
        />
      </div>

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
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Expense distribution for the selected period.
                </p>
              </CardHeader>
              <CardContent>
                <CategoryBreakdown
                  data={categoryBreakdown}
                  onCategoryClick={handleCategorySelect}
                />
              </CardContent>
            </Card>

            <TopCategoriesTable
              categories={visibleCategories.length > 0 ? visibleCategories : categoryBreakdown}
              onCategoryClick={handleCategorySelect}
            />
          </div>

          <MonthlyComparisonTimeline data={monthlyTimeline ?? []} />

          {showHomeFamilyContributors ? (
            <ContributorBreakdown contributors={contributorBreakdown} />
          ) : null}

          <BudgetVsActualTable planMonth={planMonth} rows={planVsActual} />
        </>
      )}
    </div>
  );
}