import {
  defaultAnalyticsFilters,
  filterAnalyticsTransactions,
} from "@/lib/analytics";
import { buildCategoryTotals } from "@/lib/category-totals";
import { sumInvestments } from "@/lib/investments";
import {
  filterUnlinkedOutingExpenses,
  sumPeriodExpense,
  sumPeriodIncome,
} from "@/lib/period-totals";
import { getCurrentPlanMonth } from "@/lib/plan";
import {
  getActivePurposes,
  openingBalanceForPurpose,
  PERSONAL_PURPOSE_ID,
  transactionMatchesPurpose,
} from "@/lib/purposes";
import { narrowTransactionsToFilter } from "@/lib/utils";
import { computeNetWorthBreakdown } from "@/lib/wealth";
import type {
  Account,
  Category,
  DashboardData,
  DashboardDatePreset,
  KpiDelta,
  OutingExpense,
  Purpose,
  Transaction,
} from "@/types";

function parseDashboardMonth(month = getCurrentPlanMonth()) {
  const [year, monthIndex] = month.split("-").map(Number);
  return { year, monthIndex: monthIndex - 1 };
}

function monthRangeFor(month: string, monthOffset = 0) {
  const { year, monthIndex } = parseDashboardMonth(month);
  const start = new Date(year, monthIndex + monthOffset, 1);
  const end = new Date(year, monthIndex + monthOffset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function filterByMonth(
  transactions: Transaction[],
  month = getCurrentPlanMonth(),
  monthOffset = 0,
) {
  const { start, end } = monthRangeFor(month, monthOffset);

  return transactions.filter((transaction) => {
    const date = new Date(transaction.transactionDate);
    return date >= start && date <= end;
  });
}

export function filterLastNDays(transactions: Transaction[], days: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return transactions.filter((transaction) => {
    const date = new Date(transaction.transactionDate);
    return date >= start && date <= end;
  });
}

// Income/Expense KPIs — delegated to period-totals (shared with Transactions).
// Net worth still uses isBalanceExcludedTransaction in wealth.ts.
function sumByType(transactions: Transaction[], type: Transaction["type"]) {
  if (type === "income") return sumPeriodIncome(transactions);
  return sumPeriodExpense(transactions);
}

function buildDelta(current: number, previous: number): KpiDelta {
  if (previous === 0) {
    return {
      label: current === 0 ? "No change from last month" : "New activity this month",
      percent: current === 0 ? 0 : null,
      amount: current === 0 ? 0 : current,
    };
  }

  const percent = ((current - previous) / previous) * 100;
  const amount = current - previous;
  const prefix = percent >= 0 ? "+" : "";
  return {
    label: `${prefix}${percent.toFixed(1)}% vs last month`,
    percent,
    amount,
  };
}

function formatChange(current: number, previous: number) {
  return buildDelta(current, previous).label;
}

function buildSparkline(
  transactions: Transaction[],
  month: string,
  metric: "income" | "expense" | "savings" | "net",
  accounts: Account[],
) {
  const { year, monthIndex } = parseDashboardMonth(month);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex;
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;

  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const cutoff = new Date(year, monthIndex, day, 23, 59, 59, 999);
    const subset = transactions.filter(
      (transaction) => new Date(transaction.transactionDate) <= cutoff,
    );
    const income = sumByType(subset, "income");
    const expense = sumByType(subset, "expense");
    const netWorth = computeNetWorthBreakdown(accounts, subset).total;

    if (metric === "income") return income;
    if (metric === "expense") return expense;
    if (metric === "savings") return income - expense;
    return netWorth;
  });
}

function buildTrendForLastNDays(transactions: Transaction[], days: number) {
  const scoped = filterLastNDays(transactions, days);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const sameDay = scoped.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate);
      return transactionDate.toDateString() === date.toDateString();
    });

    return {
      day: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      income: sumByType(sameDay, "income"),
      expense: sumByType(sameDay, "expense"),
    };
  });
}

function buildTrendForDateRange(
  transactions: Transaction[],
  dateFrom: string,
  dateTo: string,
) {
  const start = new Date(dateFrom);
  const end = new Date(`${dateTo}T23:59:59`);
  const dayCount = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const sameDay = transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate);
      return transactionDate.toDateString() === date.toDateString();
    });

    return {
      day: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      income: sumByType(sameDay, "income"),
      expense: sumByType(sameDay, "expense"),
    };
  });
}

function getPreviousDateRange(dateFrom: string, dateTo: string) {
  const start = new Date(dateFrom);
  const end = new Date(`${dateTo}T23:59:59`);
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);

  return {
    dateFrom: prevStart.toISOString().slice(0, 10),
    dateTo: prevEnd.toISOString().slice(0, 10),
  };
}

function filterByDateRange(
  transactions: Transaction[],
  dateFrom: string,
  dateTo: string,
) {
  return filterAnalyticsTransactions(
    transactions,
    {
      ...defaultAnalyticsFilters,
      dateFrom,
      dateTo,
      datePreset: "custom",
    },
  );
}

export function getDashboardDateRange(preset: DashboardDatePreset) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "last-7-days") {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return {
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: end.toISOString().slice(0, 10),
    };
  }

  if (preset === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: lastDay.toISOString().slice(0, 10),
    };
  }

  return getMonthDateRange(getCurrentPlanMonth());
}

export function getDashboardPeriodLabel(preset: DashboardDatePreset) {
  if (preset === "this-month") return "This Month";
  if (preset === "last-month") return "Last Month";
  if (preset === "last-7-days") return "Last 7 Days";
  if (preset === "specific-month") return "Selected Month";
  if (preset === "last-3-months") return "Last 3 Months";
  if (preset === "last-6-months") return "Last 6 Months";
  if (preset === "last-12-months") return "Last 12 Months";
  if (preset === "custom") return "Custom Range";
  return "Period";
}

export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  type: "income" | "expense";
};

// Income always reads as the app's success/green token, expense as its
// destructive/red token — `var(--success)`/`var(--destructive)` pull the
// live CSS custom properties so dark mode is handled automatically instead
// of a second hardcoded hex path. When multiple purposes render on the same
// trend chart at once, each purpose still needs a visually distinct line —
// so non-personal purposes shift to a different shade within the same green/
// red family rather than an unrelated hue, keeping "income = green family,
// expense = red family" true everywhere on the chart.
const PERSONAL_INCOME_COLOR = "var(--success)";
const PERSONAL_EXPENSE_COLOR = "var(--destructive)";
const TREND_INCOME_COLORS = ["var(--success)", "#059669", "#34d399"] as const;
const TREND_EXPENSE_COLORS = ["var(--destructive)", "#dc2626", "#fb7185"] as const;

function getPurposeTrendColors(purpose: Purpose, index: number) {
  if (purpose.id === PERSONAL_PURPOSE_ID) {
    return {
      income: PERSONAL_INCOME_COLOR,
      expense: PERSONAL_EXPENSE_COLOR,
    };
  }

  return {
    income: TREND_INCOME_COLORS[index % TREND_INCOME_COLORS.length],
    expense: TREND_EXPENSE_COLORS[index % TREND_EXPENSE_COLORS.length],
  };
}

export function buildMultiPurposeTrend(
  transactions: Transaction[],
  purposes: Purpose[],
  range: { dateFrom: string; dateTo: string },
  selectedPurposeId = "",
): {
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
} {
  const activePurposes = getActivePurposes(purposes);
  const scopedPurposes = selectedPurposeId
    ? activePurposes.filter((purpose) => purpose.id === selectedPurposeId)
    : activePurposes;

  const start = new Date(range.dateFrom);
  const end = new Date(`${range.dateTo}T23:59:59`);
  const dayCount = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  const series: TrendSeries[] = scopedPurposes.flatMap((purpose, index) => {
    const colors = getPurposeTrendColors(purpose, index);

    return [
      {
        key: `${purpose.id}-income`,
        label: `${purpose.name} Income`,
        color: colors.income,
        type: "income" as const,
      },
      {
        key: `${purpose.id}-expense`,
        label: `${purpose.name} Expense`,
        color: colors.expense,
        type: "expense" as const,
      },
    ];
  });

  const data = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayLabel = date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });

    const row: Record<string, string | number> = { day: dayLabel };

    for (const purpose of scopedPurposes) {
      const sameDay = transactions.filter((transaction) => {
        const transactionDate = new Date(transaction.transactionDate);
        return (
          transactionDate.toDateString() === date.toDateString() &&
          transactionMatchesPurpose(transaction.purposeId, purpose.id, purposes)
        );
      });

      row[`${purpose.id}-income`] = sumByType(
        sameDay.filter((transaction) => transaction.type === "income"),
        "income",
      );
      row[`${purpose.id}-expense`] = sumByType(
        sameDay.filter((transaction) => transaction.type === "expense"),
        "expense",
      );
    }

    return row;
  });

  return { data, series };
}

/** @deprecated Use computeNetWorthByPurpose from `@/lib/wealth` (same formula as Wealth). */
export { computeNetWorthByPurpose } from "@/lib/wealth";

export function buildDashboardChartSnapshot(
  transactions: Transaction[],
  categories: Category[],
  days: 7 | 30,
) {
  const scoped = filterLastNDays(transactions, days);
  return {
    incomeExpenseTrend: buildTrendForLastNDays(transactions, days),
    topCategories: buildCategoryTotals(scoped, categories, 5),
  };
}

export function buildDashboardData(
  scopedTransactions: Transaction[] = [],
  allTransactions: Transaction[] = [],
  accounts: Account[] = [],
  categories: Category[] = [],
  range: { dateFrom: string; dateTo: string },
  month = getCurrentPlanMonth(),
  unlinkedOutingExpenses: OutingExpense[] = [],
  options: { includeOutingExpenses?: boolean } = {},
  purposeFilter: { purposeId: string; categories: string[] } = {
    purposeId: "",
    categories: [],
  },
  purposes: Purpose[] = [],
): DashboardData {
  const includeOutingExpenses = options.includeOutingExpenses ?? false;

  // Purpose/Category-narrowed but NOT date-restricted — Net Worth and the
  // previous-period comparison deltas both need "all activity matching the
  // active filter", independent of the currently selected date range (Net
  // Worth is a cumulative balance, not a period metric; the comparison
  // period is a different date range entirely). `scopedTransactions` above
  // is already narrowed by filterAnalyticsTransactions, but it's also
  // clipped to the current date range, so it can't be reused for either.
  const narrowedAllTransactions = narrowTransactionsToFilter(
    allTransactions,
    purposeFilter,
    purposes,
  );

  const previousRange = getPreviousDateRange(range.dateFrom, range.dateTo);
  const previousPeriod = filterByDateRange(
    narrowedAllTransactions,
    previousRange.dateFrom,
    previousRange.dateTo,
  );

  // Same formulas as Transactions strip — never drift (9990 vs 8990).
  const unlinked = includeOutingExpenses
    ? filterUnlinkedOutingExpenses(unlinkedOutingExpenses)
    : [];
  const periodIncome = sumPeriodIncome(scopedTransactions, range);
  const periodExpense = sumPeriodExpense(scopedTransactions, {
    range,
    unlinkedOutingExpenses: unlinked,
    categories,
    includeOutingExpenses,
  });
  const periodInvested = sumInvestments(scopedTransactions, categories);
  const previousIncome = sumPeriodIncome(previousPeriod, previousRange);
  const previousExpense = sumPeriodExpense(previousPeriod, {
    range: previousRange,
    unlinkedOutingExpenses: unlinked,
    categories,
    includeOutingExpenses,
  });
  const periodSavings = periodIncome - periodExpense;
  const previousSavings = previousIncome - previousExpense;

  const rangeStart = new Date(range.dateFrom);
  // Same formula as Wealth page (per-account balances) — never invent a
  // second net-worth definition that drifts from mobile / Wealth. Uses the
  // purpose/category-narrowed (but date-unrestricted) ledger so Net Worth
  // reflects the active filter — e.g. Purpose = Family only counts Family's
  // own income/expense splits, not the whole household's.
  const netWorth = computeNetWorthBreakdown(
    accounts,
    narrowedAllTransactions,
    unlinkedOutingExpenses,
  ).total;
  const previousNetWorth = computeNetWorthBreakdown(
    accounts,
    narrowedAllTransactions.filter(
      (transaction) =>
        new Date(transaction.transactionDate ?? transaction.date ?? 0) <
        rangeStart,
    ),
    unlinkedOutingExpenses,
  ).total;

  const savingsRate =
    periodIncome > 0 ? Math.round((periodSavings / periodIncome) * 100) : 0;

  const rangeEnd = new Date(`${range.dateTo}T23:59:59`);
  const daysElapsed = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) +
      1,
  );
  const averageDailySpend = Math.round(periodExpense / daysElapsed);

  const categoryTotals = buildCategoryTotals(scopedTransactions, categories, 5);
  const topCategory = categoryTotals[0] ?? null;
  const expenseRatio =
    periodIncome > 0
      ? Math.min(100, Math.round((periodExpense / periodIncome) * 100))
      : 0;

  const recentTransactions = [...scopedTransactions]
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .slice(0, 10);

  const highlights = recentTransactions.slice(0, 3).map((transaction, index) => ({
    label: `${transaction.type === "expense" ? "Expense" : "Income"} · ${transaction.merchant}`,
    tone:
      transaction.type === "income"
        ? ("success" as const)
        : index === 2
          ? ("warning" as const)
          : ("danger" as const),
    timestamp: transaction.transactionDate,
  }));

  return {
    kpis: {
      netWorth,
      income: periodIncome,
      expense: periodExpense,
      invested: periodInvested,
      savings: periodSavings,
      savingsRate,
      incomeChange: formatChange(periodIncome, previousIncome),
      expenseChange: formatChange(periodExpense, previousExpense),
      savingsChange: formatChange(periodSavings, previousSavings),
      netWorthDelta: buildDelta(netWorth, previousNetWorth),
      incomeDelta: buildDelta(periodIncome, previousIncome),
      expenseDelta: buildDelta(periodExpense, previousExpense),
      savingsDelta: buildDelta(periodSavings, previousSavings),
      netWorthSparkline: buildSparkline(narrowedAllTransactions, month, "net", accounts),
      incomeSparkline: buildSparkline(scopedTransactions, month, "income", accounts),
      expenseSparkline: buildSparkline(scopedTransactions, month, "expense", accounts),
      savingsSparkline: buildSparkline(scopedTransactions, month, "savings", accounts),
    },
    insights: {
      topCategory: topCategory?.name ?? null,
      topCategoryAmount: topCategory?.value ?? 0,
      transactionCount: scopedTransactions.length,
      expenseRatio,
      savingsRate,
      averageDailySpend,
      highlights,
    },
    recentTransactions,
    incomeExpenseTrend: buildTrendForDateRange(
      scopedTransactions,
      range.dateFrom,
      range.dateTo,
    ),
    incomeExpenseTrend30: buildTrendForLastNDays(narrowedAllTransactions, 30),
    topCategories: categoryTotals,
  };
}

export function getMonthDateRange(month: string) {
  const { start, end } = monthRangeFor(month, 0);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}