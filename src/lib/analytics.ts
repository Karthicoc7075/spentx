import {
  applyAnalyticsFilters,
  type AnalyticsFilterContext,
} from "@/lib/analytics-filters";
import { buildCategoryTotals } from "@/lib/category-totals";
import {
  isOutingRollupLike,
  isSpendingExpense,
  isTransferTransaction,
  sumInvestments,
  sumSpendingExpenses,
} from "@/lib/investments";
import { computeCategorySpentActuals, getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import { narrowTransactionsToFilter } from "@/lib/utils";
import { OPENING_BALANCE_CATEGORY } from "@/lib/wealth";
import type {
  AnalyticsFilters,
  AnalyticsHeroStats,
  Category,
  GlobalFilters,
  MonthlyPlan,
  PlanComparisonSummary,
  Purpose,
  Transaction,
} from "@/types";

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateRangeForPreset(preset: AnalyticsFilters["datePreset"]) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);

  if (preset === "this-month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === "last-month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setDate(0);
  } else if (preset === "last-3-months") {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (preset === "this-year") {
    start = new Date(now.getFullYear(), 0, 1);
  }

  return {
    dateFrom: toLocalDateKey(start),
    dateTo: toLocalDateKey(end),
  };
}

export const defaultAnalyticsFilters: AnalyticsFilters = {
  ...getDateRangeForPreset("this-month"),
  categories: [],
  account: "",
  source: "",
  search: "",
  minAmount: "",
  maxAmount: "",
  transactionType: "",
  dashboardMonth: getCurrentPlanMonth(),
  dashboardDatePreset: "this-month",
  purposeId: "",
  contributorSource: "",
  specificMonth: getCurrentPlanMonth(),
  purpose: "",
  merchant: "",
  transactionStatus: "",
  tags: [],
  categoryGroup: "",
  sortBy: "newest",
  outingType: "",
  outingWithWhom: "",
  outingStatus: "",
  trendGranularity: "daily",
  datePreset: "this-month",
  compareMode: "",
};

export function filterAnalyticsTransactions(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext = {},
) {
  return applyAnalyticsFilters(transactions, filters, context);
}

// The Opening Balance transaction is always income-typed and is already
// baked into account.openingBalance wherever that seed is added — excluding
// it here keeps every income figure derived from sumByType free of
// double-counting.
function sumByType(transactions: Transaction[], type: Transaction["type"]) {
  const scoped = transactions.filter(
    (transaction) => transaction.category !== OPENING_BALANCE_CATEGORY,
  );

  if (type === "expense") {
    return sumSpendingExpenses(scoped);
  }

  // Settlements (internal transfers) must be excluded symmetrically with the
  // expense side, or a transfer's income leg gets counted without its
  // equal-and-opposite expense leg.
  return scoped
    .filter(
      (transaction) => transaction.type === type && !isTransferTransaction(transaction),
    )
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
}

export function computeHeroStats(transactions: Transaction[]): AnalyticsHeroStats {
  const totalIncome = sumByType(transactions, "income");
  const totalExpense = sumByType(transactions, "expense");
  const investmentTotal = sumInvestments(transactions);
  const netSavings = totalIncome - totalExpense;
  const savingsRate =
    totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  const investmentRate =
    totalIncome > 0 ? Math.round((investmentTotal / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    investmentTotal,
    investmentRate,
    transactionCount: transactions.length,
  };
}

type TrendBucket = { income: number; expense: number };

function getAnchorDate(filters: AnalyticsFilters) {
  return new Date(filters.dateTo || filters.dateFrom || new Date().toISOString());
}

function getCalendarMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

function getPreviousCalendarMonthRange(filters: AnalyticsFilters) {
  const anchor = getAnchorDate(filters);
  return getCalendarMonthRange(anchor.getFullYear(), anchor.getMonth() - 1);
}

function getPriorCalendarMonthRanges(filters: AnalyticsFilters, months: number) {
  const anchor = getAnchorDate(filters);
  return Array.from({ length: months }, (_, index) =>
    getCalendarMonthRange(
      anchor.getFullYear(),
      anchor.getMonth() - (index + 1),
    ),
  );
}

function buildTrendBuckets(
  transactions: Transaction[],
  granularity: AnalyticsFilters["trendGranularity"],
) {
  const buckets = new Map<string, TrendBucket>();

  for (const transaction of transactions) {
    if (transaction.category === OPENING_BALANCE_CATEGORY) continue;
    if (isTransferTransaction(transaction)) continue;
    // Investment expenses count as cash outflow (same as Period Outflow).
    if (isOutingRollupLike(transaction)) continue;
    const amount = transaction.totalAmount ?? transaction.amount ?? 0;
    if (amount <= 0 && transaction.type === "expense") continue;
    const date = new Date(
      transaction.transactionDate ?? transaction.date ?? Date.now(),
    );
    const key =
      granularity === "weekly"
        ? getWeekKey(date)
        : date.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    if (transaction.type === "income") bucket.income += amount;
    else if (transaction.type === "expense") bucket.expense += amount;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({
      label: formatTrendLabel(key, granularity),
      income: values.income,
      expense: values.expense,
      key,
    }));
}

function averageTrendSeries(
  seriesList: Array<Array<{ label: string; income: number; expense: number; key: string }>>,
  current: Array<{ label: string; income: number; expense: number; key: string }>,
) {
  return current.map((point, index) => {
    let incomeTotal = 0;
    let expenseTotal = 0;
    let count = 0;

    for (const series of seriesList) {
      const bucket = series[index];
      if (!bucket) continue;
      incomeTotal += bucket.income;
      expenseTotal += bucket.expense;
      count += 1;
    }

    return {
      label: point.label,
      income: count > 0 ? Math.round(incomeTotal / count) : 0,
      expense: count > 0 ? Math.round(expenseTotal / count) : 0,
      key: point.key,
    };
  });
}

function categoryTotalsMap(
  transactions: Transaction[],
  categories: Category[],
) {
  return new Map(
    buildCategoryTotals(transactions, categories).map((row) => [row.name, row.value]),
  );
}

function getComparisonCategoryTotals(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext,
  categories: Category[] = [],
) {
  if (!filters.compareMode) return new Map<string, number>();

  if (filters.compareMode === "previous-month") {
    const range = getPreviousCalendarMonthRange(filters);
    const prevExpenses = filterAnalyticsTransactions(
      transactions,
      { ...filters, ...range, compareMode: "", categories: [], categoryGroup: "" },
      context,
    );
    return categoryTotalsMap(prevExpenses, categories);
  }

  const months = filters.compareMode === "avg-3-months" ? 3 : 6;
  const totals = new Map<string, number>();

  for (const range of getPriorCalendarMonthRanges(filters, months)) {
    const monthExpenses = filterAnalyticsTransactions(
      transactions,
      { ...filters, ...range, compareMode: "", categories: [], categoryGroup: "" },
      context,
    );
    for (const [category, amount] of categoryTotalsMap(monthExpenses, categories)) {
      totals.set(category, (totals.get(category) ?? 0) + amount);
    }
  }

  for (const [category, amount] of totals) {
    totals.set(category, Math.round(amount / months));
  }

  return totals;
}

function buildComparisonTrendSeries(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext,
  current: Array<{ label: string; income: number; expense: number; key: string }>,
) {
  if (!filters.compareMode) return [];

  const granularity = filters.trendGranularity;

  if (filters.compareMode === "previous-month") {
    const range = getPreviousCalendarMonthRange(filters);
    const previousTransactions = filterAnalyticsTransactions(
      transactions,
      { ...filters, ...range, compareMode: "" },
      context,
    );
    const previous = buildTrendBuckets(previousTransactions, granularity);
    return current.map((point, index) => previous[index] ?? {
      label: point.label,
      income: 0,
      expense: 0,
      key: point.key,
    });
  }

  const months = filters.compareMode === "avg-3-months" ? 3 : 6;
  const seriesList = getPriorCalendarMonthRanges(filters, months).map((range) =>
    buildTrendBuckets(
      filterAnalyticsTransactions(
        transactions,
        { ...filters, ...range, compareMode: "" },
        context,
      ),
      granularity,
    ),
  );

  return averageTrendSeries(seriesList, current);
}

export function computeTrendData(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext = {},
) {
  const scoped = filterAnalyticsTransactions(transactions, filters, context);
  const granularity = filters.trendGranularity;
  const current = buildTrendBuckets(scoped, granularity);
  const previous = buildComparisonTrendSeries(
    transactions,
    filters,
    context,
    current,
  );

  return { current, previous };
}

export type MonthlyTimelineItem = {
  month: string;
  income: number;
  expense: number;
  savings: number;
};

const MONTHLY_COMPARISON_MONTHS = 6;

function formatMonthlyComparisonLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

export function computeMonthlyComparisonTimeline(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext = {},
): MonthlyTimelineItem[] {
  const anchor = new Date();
  const purposeScoped = filterAnalyticsTransactions(
    transactions,
    {
      ...filters,
      dateFrom: "",
      dateTo: "",
      compareMode: "",
    },
    context,
  );

  return Array.from({ length: MONTHLY_COMPARISON_MONTHS }, (_, index) => {
    const offset = MONTHLY_COMPARISON_MONTHS - 1 - index;
    const range = getCalendarMonthRange(
      anchor.getFullYear(),
      anchor.getMonth() - offset,
    );

    let income = 0;
    let expense = 0;
    for (const transaction of purposeScoped) {
      if (transaction.category === OPENING_BALANCE_CATEGORY) continue;
      if (isTransferTransaction(transaction)) continue;
      const date = transaction.transactionDate.slice(0, 10);
      if (date < range.dateFrom || date > range.dateTo) continue;
      if (transaction.type === "income") income += transaction.totalAmount;
      else expense += transaction.totalAmount;
    }

    const [year, month] = range.dateFrom.split("-").map(Number);

    return {
      month: formatMonthlyComparisonLabel(year, month - 1),
      income,
      expense,
      savings: income - expense,
    };
  });
}

function getWeekKey(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

function formatTrendLabel(key: string, granularity: "daily" | "weekly") {
  const date = new Date(key);
  if (granularity === "weekly") {
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function computeCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  allTransactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext = {},
) {
  const rows = buildCategoryTotals(transactions, categories);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  const previousTotals = getComparisonCategoryTotals(
    allTransactions,
    filters,
    context,
    categories,
  );

  return rows.map((row) => {
    const previous = previousTotals.get(row.name) ?? 0;
    const trend =
      previous === 0
        ? row.value > 0
          ? 100
          : 0
        : Math.round(((row.value - previous) / previous) * 100);
    return {
      name: row.name,
      value: row.value,
      color: row.color,
      percent: total > 0 ? Math.round((row.value / total) * 100) : 0,
      trend,
    };
  });
}

function merchantDisplayName(transaction: Transaction) {
  const name = transaction.merchant?.trim();
  if (name) return name;
  const note = transaction.note?.trim();
  if (note) return note;
  if (transaction.category?.trim()) return transaction.category;
  return "Unknown merchant";
}

function merchantTransactionAmount(transaction: Transaction) {
  return transaction.totalAmount ?? transaction.amount ?? 0;
}

export function computeTopMerchants(
  transactions: Transaction[],
  categories: Category[] = [],
  limit?: number,
) {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (!isSpendingExpense(transaction, categories)) continue;
    const amount = merchantTransactionAmount(transaction);
    if (amount <= 0) continue;
    const merchant = merchantDisplayName(transaction);
    totals.set(merchant, (totals.get(merchant) ?? 0) + amount);
  }

  const sorted = [...totals.entries()]
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount);

  return limit ? sorted.slice(0, limit) : sorted;
}

const analysisPeriodPresetLabels: Record<
  AnalyticsFilters["datePreset"],
  string
> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "this-year": "This year",
  custom: "Custom range",
};

export function formatAnalyticsPeriodLabel(filters: AnalyticsFilters) {
  if (!filters.dateFrom || !filters.dateTo) {
    return analysisPeriodPresetLabels[filters.datePreset] ?? "Selected period";
  }

  const from = new Date(`${filters.dateFrom}T12:00:00`);
  const to = new Date(`${filters.dateTo}T12:00:00`);
  const sameMonth =
    from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const monthLabel = from.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const rangeLabel = `${from.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })} – ${to.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  if (sameMonth) {
    return `${monthLabel} (${rangeLabel})`;
  }

  return rangeLabel;
}

export function getPlanMonthFromFilters(filters: AnalyticsFilters) {
  const anchor = filters.dateTo || filters.dateFrom || new Date().toISOString();
  const date = new Date(anchor);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function computeContributorBreakdown(transactions: Transaction[]) {
  const income = transactions.filter(
    (transaction) =>
      transaction.type === "income" &&
      transaction.category !== OPENING_BALANCE_CATEGORY &&
      !isTransferTransaction(transaction),
  );
  const total = income.reduce((sum, transaction) => sum + transaction.totalAmount, 0);

  const totalsBySource = new Map<string, number>();
  for (const transaction of income) {
    const source = transaction.contributorSource || "Me";
    totalsBySource.set(source, (totalsBySource.get(source) ?? 0) + transaction.totalAmount);
  }

  return [...totalsBySource.entries()]
    .map(([source, amount]) => ({
      source,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Scoped strictly to `plan.month` (and the plan's own purpose), never to
 * whatever broader date range the Analysis page's own filters happen to
 * have selected — otherwise a "last 3 months" filter would inflate actuals
 * against a single month's allocations. Uses the same
 * computeCategorySpentActuals the Plan page uses, so the two pages can
 * never disagree on a given month's numbers.
 */
export function computePlanVsActual(
  transactions: Transaction[],
  plan: MonthlyPlan | null | undefined,
  purposes: Purpose[] = [],
  categories: Category[] = [],
  filterCategories: string[] = [],
) {
  if (!plan) return [];

  // narrowTransactionsToFilter (not a plain .filter) — a split expense must
  // count only its matching split's amount toward this plan's purpose, not
  // the whole transaction total; it also folds in the active global
  // Category filter (if any) the same way every other Dashboard/Analysis
  // number does.
  const purposeTransactions = narrowTransactionsToFilter(
    transactions,
    { purposeId: plan.purposeId ?? "", categories: filterCategories },
    purposes,
  );
  const categorySpentActuals = computeCategorySpentActuals(purposeTransactions, plan.month);
  const colorByName = new Map(categories.map((category) => [category.name, category.color]));

  const rows = plan.allocations
    .filter((allocation) => allocation.plannedAmount > 0)
    .map((allocation) => {
      const actual = categorySpentActuals[allocation.category] || 0;
      return {
        category: allocation.category,
        planned: allocation.plannedAmount,
        actual,
        color: allocation.color,
        status: actual <= allocation.plannedAmount ? ("under" as const) : ("over" as const),
      };
    });

  // A category spent against this month with no (or zero) plan allocation
  // is still real spending — surface it as "over" rather than dropping it.
  const includedCategories = new Set(rows.map((row) => row.category));
  for (const [category, actual] of Object.entries(categorySpentActuals)) {
    if (actual <= 0 || includedCategories.has(category)) continue;
    rows.push({
      category,
      planned: 0,
      actual,
      color: colorByName.get(category) ?? "#64748b",
      status: "over" as const,
    });
  }

  return rows.sort((a, b) => b.actual - a.actual);
}

export function computePlanComparisonSummary(
  transactions: Transaction[],
  plan: MonthlyPlan | null | undefined,
): PlanComparisonSummary | null {
  if (!plan) return null;

  const plannedTotal = sumPlanned(plan.allocations);
  if (plannedTotal <= 0) return null;

  const actualTotal = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

  const variancePercent = Math.round(
    ((actualTotal - plannedTotal) / plannedTotal) * 100,
  );

  let status: PlanComparisonSummary["status"] = "on-track";
  if (variancePercent > 5) status = "over";
  else if (variancePercent < -5) status = "under";

  const message =
    variancePercent > 5
      ? `You are ${variancePercent}% over your Monthly Plan overall.`
      : variancePercent < -5
        ? `You are ${Math.abs(variancePercent)}% under your Monthly Plan overall.`
        : "You are closely following your Monthly Plan.";

  return {
    plannedTotal,
    actualTotal,
    variancePercent,
    status,
    message,
  };
}

export function computePlanAdherenceOverTime(
  transactions: Transaction[],
  plan: MonthlyPlan | null | undefined,
  filters: AnalyticsFilters,
) {
  if (!plan || !filters.dateFrom || !filters.dateTo) return [];

  const plannedTotal = sumPlanned(plan.allocations);
  if (plannedTotal <= 0) return [];

  const start = new Date(filters.dateFrom);
  const end = new Date(`${filters.dateTo}T23:59:59`);
  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );
  const dailyPlan = plannedTotal / totalDays;

  const expenses = transactions.filter((transaction) => transaction.type === "expense");
  const points: Array<{
    label: string;
    adherence: number;
    cumulativeActual: number;
    cumulativePlanned: number;
  }> = [];

  let cumulativeActual = 0;
  for (let index = 0; index < totalDays; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayKey = date.toDateString();
    const daySpend = expenses
      .filter(
        (transaction) => new Date(transaction.transactionDate).toDateString() === dayKey,
      )
      .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

    cumulativeActual += daySpend;
    const cumulativePlanned = dailyPlan * (index + 1);
    const adherence =
      cumulativePlanned > 0
        ? Math.min(150, Math.round((cumulativeActual / cumulativePlanned) * 100))
        : 0;

    points.push({
      label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      adherence,
      cumulativeActual,
      cumulativePlanned,
    });
  }

  return filters.trendGranularity === "weekly"
    ? points.filter((_, index) => index % 7 === 6 || index === points.length - 1)
    : points;
}

export function applyDrillDownFilter(
  filters: AnalyticsFilters,
  drill: { category?: string; merchant?: string },
): AnalyticsFilters {
  if (drill.category) {
    return { ...filters, categories: [drill.category], datePreset: "custom" };
  }
  if (drill.merchant) {
    return { ...filters, search: drill.merchant, datePreset: "custom" };
  }
  return filters;
}

export function computeDetailedStats(
  transactions: Transaction[],
  filtered: Transaction[],
  plan: MonthlyPlan | null | undefined,
  filters: AnalyticsFilters,
) {
  const start = new Date(filters.dateFrom || new Date().toISOString());
  const end = new Date(filters.dateTo || new Date().toISOString());
  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );
  const expenses = filtered.filter(
    (t) => t.type === "expense" && !isTransferTransaction(t),
  );
  const incomes = filtered.filter(
    (t) =>
      t.type === "income" &&
      t.category !== OPENING_BALANCE_CATEGORY &&
      !isTransferTransaction(t),
  );
  const totalExpenses = expenses.reduce((sum, t) => sum + t.totalAmount, 0);
  const totalIncome = incomes.reduce((sum, t) => sum + t.totalAmount, 0);
  const netSavings = totalIncome - totalExpenses;

  const dailyAverageSpend =
    totalExpenses > 0 ? Math.round(totalExpenses / totalDays) : 0;

  let largestExpense: Transaction | null = null;
  if (expenses.length > 0) {
    largestExpense = expenses.reduce((max, t) => (t.totalAmount > max.totalAmount ? t : max), expenses[0]);
  }

  const plannedTotal = plan
    ? plan.allocations.reduce((sum, item) => sum + item.plannedAmount, 0)
    : 0;

  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysRemaining = Math.max(1, endOfMonth.getDate() - today.getDate());

  const burnRate =
    plannedTotal > 0
      ? Math.min(150, Math.round((totalExpenses / plannedTotal) * 100))
      : totalIncome > 0
        ? Math.round((totalExpenses / totalIncome) * 100)
        : 0;

  const dailySafeSpend =
    plannedTotal > 0
      ? Math.max(0, Math.round((plannedTotal - totalExpenses) / daysRemaining))
      : totalIncome > 0
        ? Math.max(0, Math.round(netSavings / daysRemaining))
        : 0;

  const remainingBudget =
    plannedTotal > 0 ? plannedTotal - totalExpenses : netSavings;

  const daysUntilExhaustion =
    dailyAverageSpend > 0 && remainingBudget > 0
      ? Math.max(0, Math.round(remainingBudget / dailyAverageSpend))
      : 0;

  let runningBal = netSavings;
  const forecastBalanceTimeline =
    dailyAverageSpend > 0
      ? Array.from({ length: 15 }, (_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() + i * 2);
          runningBal = Math.max(0, runningBal - dailyAverageSpend * 2);
          return {
            label: d.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            }),
            balance: runningBal,
          };
        })
      : [];

  const projectedMonthEnd = runningBal;

  const billCategories = new Set([
    "Rent",
    "Utilities",
    "Subscriptions",
    "Insurance",
    "Health",
  ]);
  const upcomingBills = [...expenses]
    .filter((t) => billCategories.has(t.category))
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .slice(0, 5)
    .map((t) => ({
      name: t.merchant,
      amount: t.totalAmount,
      date: new Date(t.transactionDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
    }));

  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    amount: 0,
  }));
  let morning = 0;
  let afternoon = 0;
  let evening = 0;
  let night = 0;
  for (const t of expenses) {
    const hr = new Date(t.transactionDate).getHours();
    if (hr >= 6 && hr < 12) morning += t.totalAmount;
    else if (hr >= 12 && hr < 18) afternoon += t.totalAmount;
    else if (hr >= 18 && hr < 22) evening += t.totalAmount;
    else night += t.totalAmount;
    hourlyDistribution[hr].amount += t.totalAmount;
  }

  const timeOfDaySplit = [
    { name: "Morning (6 AM - 12 PM)", value: morning },
    { name: "Afternoon (12 PM - 6 PM)", value: afternoon },
    { name: "Evening (6 PM - 10 PM)", value: evening },
    { name: "Night (10 PM - 6 AM)", value: night },
  ];

  let weekdayTotal = 0;
  let weekendTotal = 0;
  for (const t of expenses) {
    const day = new Date(t.transactionDate).getDay();
    if (day === 0 || day === 6) weekendTotal += t.totalAmount;
    else weekdayTotal += t.totalAmount;
  }

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const daySpendMap = new Map<number, number>();
  for (const t of expenses) {
    const day = new Date(t.transactionDate).getDay();
    daySpendMap.set(day, (daySpendMap.get(day) ?? 0) + t.totalAmount);
  }
  let maxDayIdx = 0;
  let maxDaySpend = 0;
  for (const [day, amt] of daySpendMap.entries()) {
    if (amt > maxDaySpend) {
      maxDaySpend = amt;
      maxDayIdx = day;
    }
  }
  const highestDay =
    maxDaySpend > 0 ? daysOfWeek[maxDayIdx] : "No spending yet";

  const impulseTxns = expenses.filter(
    (t) =>
      ["Dining", "Shopping", "Entertainment"].includes(t.category) &&
      t.totalAmount > 1500,
  );
  const impulseCount = impulseTxns.length;
  const impulseTotal = impulseTxns.reduce((sum, t) => sum + t.totalAmount, 0);

  const salaryTotal = incomes
    .filter((t) => t.category === "Salary")
    .reduce((sum, t) => sum + t.totalAmount, 0);
  const freelanceTotal = incomes
    .filter((t) => t.category === "Freelance")
    .reduce((sum, t) => sum + t.totalAmount, 0);
  const passiveTotal = incomes
    .filter((t) => !["Salary", "Freelance"].includes(t.category))
    .reduce((sum, t) => sum + t.totalAmount, 0);

  const totalIncSum = salaryTotal + freelanceTotal + passiveTotal;
  const salaryPercent =
    totalIncSum > 0 ? Math.round((salaryTotal / totalIncSum) * 100) : 0;
  const freelancePercent =
    totalIncSum > 0 ? Math.round((freelanceTotal / totalIncSum) * 100) : 0;
  const passivePercent =
    totalIncSum > 0 ? Math.round((passiveTotal / totalIncSum) * 100) : 0;
  const diversificationScore = Math.min(
    100,
    (salaryTotal > 0 ? 40 : 0) +
      (freelanceTotal > 0 ? 30 : 0) +
      (passiveTotal > 0 ? 30 : 0),
  );

  const incomeStreams = [
    { name: "Salary", amount: salaryTotal, type: "Salary", pct: salaryPercent },
    {
      name: "Freelance",
      amount: freelanceTotal,
      type: "Freelance",
      pct: freelancePercent,
    },
    {
      name: "Other income",
      amount: passiveTotal,
      type: "Passive",
      pct: passivePercent,
    },
  ].filter((stream) => stream.amount > 0);

  const accMap = new Map<string, number>();
  const payMap = new Map<string, number>();
  for (const t of expenses) {
    if (t.accountName) {
      accMap.set(t.accountName, (accMap.get(t.accountName) ?? 0) + t.totalAmount);
    }
    const pm =
      t.source === "mobile"
        ? "UPI"
        : t.source === "bank-sync"
          ? "Card"
          : t.source === "manual"
            ? "Cash"
            : "Other";
    payMap.set(pm, (payMap.get(pm) ?? 0) + t.totalAmount);
  }

  const accounts = [...accMap.entries()].map(([name, balance]) => ({
    name,
    balance,
    percentage:
      totalExpenses > 0 ? Math.round((balance / totalExpenses) * 100) : 0,
  }));
  const payments = [...payMap.entries()].map(([name, value]) => ({
    name,
    value,
  }));

  const financialEvents = [...filtered]
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .map((t) => {
      let title = `${t.category} at ${t.merchant}`;
      if (t.category === "Salary") title = "Salary Credited";
      else if (t.category === "Rent") title = "Rent Paid";
      else if (t.totalAmount > 5000) title = `Large Purchase: ${t.merchant}`;

      return {
        id: t.id,
        title,
        category: t.category,
        amount: t.totalAmount,
        date: new Date(t.transactionDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        type: t.type,
      };
    })
    .slice(0, 8);

  const anomalies: Array<{
    id: string;
    message: string;
    severity: "low" | "medium" | "high";
    amount: number;
  }> = [];
  for (const t of expenses) {
    if (t.totalAmount > 10000 && t.category !== "Rent") {
      anomalies.push({
        id: t.id,
        message: `High value transaction of ₹${t.totalAmount.toLocaleString("en-IN")} at ${t.merchant}`,
        severity: "high",
        amount: t.totalAmount,
      });
    } else if (
      t.totalAmount > 3000 &&
      ["Dining", "Shopping", "Entertainment"].includes(t.category)
    ) {
      anomalies.push({
        id: t.id,
        message: `Discretionary spike: ₹${t.totalAmount.toLocaleString("en-IN")} at ${t.merchant}`,
        severity: "medium",
        amount: t.totalAmount,
      });
    }
  }

  const savingsRate =
    totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  let healthScore = 0;
  if (totalIncome > 0 || totalExpenses > 0) {
    healthScore = 50;
    if (savingsRate >= 40) healthScore += 25;
    else if (savingsRate >= 25) healthScore += 15;
    else if (savingsRate >= 10) healthScore += 5;
    else if (savingsRate < 0) healthScore -= 15;
    if (plannedTotal > 0) {
      const utilization = (totalExpenses / plannedTotal) * 100;
      if (utilization <= 70) healthScore += 15;
      else if (utilization <= 90) healthScore += 8;
      else if (utilization > 100) healthScore -= 10;
    }
    healthScore = Math.max(0, Math.min(100, healthScore));
  }

  let healthStatus: "On Track" | "Needs Attention" | "At Risk" = "On Track";
  if (healthScore < 50) healthStatus = "At Risk";
  else if (healthScore < 75) healthStatus = "Needs Attention";

  let healthAIRecommend = "";
  if (totalIncome === 0 && totalExpenses === 0) {
    healthAIRecommend =
      "Add income and expense transactions to unlock personalised health insights.";
  } else if (healthScore < 50) {
    healthAIRecommend =
      "Spending is outpacing income or plan limits. Review discretionary categories.";
  } else if (healthScore < 75) {
    healthAIRecommend =
      "You're making progress. Tighten variable spends to improve your savings rate.";
  } else {
    healthAIRecommend =
      "Strong savings discipline this period. Consider routing surplus into investments.";
  }

  const daysInMonth = endOfMonth.getDate();
  const expectedExpense = Math.round(dailyAverageSpend * daysInMonth);
  const expectedSavings = Math.max(0, totalIncome - expectedExpense);
  const confidenceScore = Math.min(
    95,
    Math.max(20, Math.round((filtered.length / 10) * 20)),
  );

  const spendTotal = weekdayTotal + weekendTotal;

  return {
    dailyAverageSpend,
    largestExpense,
    velocity: {
      burnRate,
      dailySafeSpend,
      daysUntilExhaustion,
      forecastBalanceTimeline,
      projectedMonthEnd,
      upcomingBills,
    },
    behaviour: {
      highestDay,
      weekendRatio:
        spendTotal > 0 ? Math.round((weekendTotal / spendTotal) * 100) : 0,
      weekdayRatio:
        spendTotal > 0 ? Math.round((weekdayTotal / spendTotal) * 100) : 0,
      impulseCount,
      impulseTotal,
      hourlyDistribution,
      timeOfDaySplit,
    },
    incomeDependency: {
      salaryPercent,
      freelancePercent,
      passivePercent,
      diversificationScore,
      incomeStreams,
    },
    accountPayment: {
      accounts,
      payments,
    },
    financialEvents,
    anomalies,
    forecast: {
      expectedExpense,
      expectedSavings,
      confidenceScore,
    },
    healthScore,
    healthStatus,
    healthAIRecommend,
  };
}