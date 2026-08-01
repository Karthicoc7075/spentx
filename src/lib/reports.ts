import {
  computeCategoryBreakdown,
  computeHeroStats,
  computePlanComparisonSummary,
  computeTopMerchants,
  defaultAnalyticsFilters,
  filterAnalyticsTransactions,
  getPlanMonthFromFilters,
} from "@/lib/analytics";
import type {
  AnalyticsFilters,
  Category,
  FinancialReportData,
  MonthlyPlan,
  ReportType,
  Transaction,
} from "@/types";

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function getMonthRange(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + monthOffset + 1,
    0,
  );
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    }),
  };
}

export function buildReportFilters(
  type: ReportType,
  dateFrom?: string,
  dateTo?: string,
): AnalyticsFilters {
  if (type === "monthly") {
    const range = getMonthRange(0);
    return {
      ...defaultAnalyticsFilters,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      datePreset: "this-month",
    };
  }

  return {
    ...defaultAnalyticsFilters,
    dateFrom: dateFrom ?? defaultAnalyticsFilters.dateFrom,
    dateTo: dateTo ?? defaultAnalyticsFilters.dateTo,
    datePreset: "custom",
  };
}

export function buildFinancialReport({
  transactions: rawTransactions,
  categories,
  plan,
  type,
  dateFrom,
  dateTo,
  includeOutings = true,
}: {
  transactions: Transaction[];
  categories: Category[];
  plan?: MonthlyPlan | null;
  type: ReportType;
  dateFrom?: string;
  dateTo?: string;
  includeOutings?: boolean;
}): FinancialReportData {
  const transactions = includeOutings
    ? rawTransactions
    : rawTransactions.filter((tx) => !tx.outingId && !tx.tags?.includes("outing-analytics"));

  const filters = buildReportFilters(type, dateFrom, dateTo);
  const filtered = filterAnalyticsTransactions(transactions, filters);
  const hero = computeHeroStats(filtered);
  const categoryData = computeCategoryBreakdown(
    filtered,
    categories,
    transactions,
    filters,
  );
  const merchants = computeTopMerchants(filtered, categories, 5);
  const planSummary =
    type === "plan-vs-actual"
      ? computePlanComparisonSummary(filtered, plan)
      : null;

  const periodLabel =
    type === "monthly"
      ? getMonthRange(0).label
      : `${filters.dateFrom} to ${filters.dateTo}`;

  const topCategory = categoryData[0];
  const narrative = [
    `During ${periodLabel}, you earned ${formatInr(hero.totalIncome)} and spent ${formatInr(hero.totalExpense)}.`,
    hero.netSavings >= 0
      ? `You saved ${formatInr(hero.netSavings)} with a savings rate of ${hero.savingsRate}%.`
      : `Spending exceeded income by ${formatInr(Math.abs(hero.netSavings))}.`,
    topCategory
      ? `${topCategory.name} was your top category at ${formatInr(topCategory.value)} (${topCategory.percent}% of spending).`
      : "No expense categories recorded in this period.",
    planSummary
      ? planSummary.message
      : "Keep tracking daily to stay aligned with your goals.",
  ].join(" ");

  return {
    title:
      type === "plan-vs-actual"
        ? "Plan vs Actual Report"
        : type === "monthly"
          ? "Monthly Financial Report"
          : "Custom Financial Report",
    periodLabel,
    generatedAt: new Date().toISOString(),
    totalIncome: hero.totalIncome,
    totalExpense: hero.totalExpense,
    netSavings: hero.netSavings,
    savingsRate: hero.savingsRate,
    categories: categoryData.map((item) => ({
      name: item.name,
      amount: item.value,
      percent: item.percent,
    })),
    topMerchants: merchants,
    planSummary: planSummary
      ? {
          plannedTotal: planSummary.plannedTotal,
          actualTotal: planSummary.actualTotal,
          variancePercent: planSummary.variancePercent,
          message: planSummary.message,
        }
      : undefined,
    narrative,
  };
}

export function getReportPlanMonth(filters: AnalyticsFilters) {
  return getPlanMonthFromFilters(filters);
}