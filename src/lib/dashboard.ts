import {
  defaultAnalyticsFilters,
  filterAnalyticsTransactions,
} from "@/lib/analytics";
import {
  isSpendingExpense,
  sumInvestments,
  sumSpendingExpenses,
} from "@/lib/investments";
import { getCurrentPlanMonth } from "@/lib/plan";
import {
  getActivePurposes,
  openingBalanceForPurpose,
  PERSONAL_PURPOSE_ID,
  transactionMatchesPurpose,
} from "@/lib/purposes";
import type {
  Account,
  Category,
  DashboardData,
  DashboardDatePreset,
  KpiDelta,
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
    const date = new Date(transaction.date);
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
    const date = new Date(transaction.date);
    return date >= start && date <= end;
  });
}

function sumByType(transactions: Transaction[], type: Transaction["type"]) {
  if (type === "expense") {
    return sumSpendingExpenses(transactions);
  }

  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
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
      (transaction) => new Date(transaction.date) <= cutoff,
    );
    const income = sumByType(subset, "income");
    const expense = sumByType(subset, "expense");
    const netWorth =
      accounts.reduce((sum, account) => sum + account.openingBalance, 0) +
      income -
      expense;

    if (metric === "income") return income;
    if (metric === "expense") return expense;
    if (metric === "savings") return income - expense;
    return netWorth;
  });
}

export function buildCategoryTotals(
  monthTransactions: Transaction[],
  categories: Category[],
) {
  const colorByName = new Map(
    categories.map((category) => [category.name, category.color]),
  );
  const totals = new Map<string, number>();

  for (const transaction of monthTransactions) {
    if (!isSpendingExpense(transaction)) continue;
    totals.set(
      transaction.category,
      (totals.get(transaction.category) ?? 0) + transaction.amount,
    );
  }

  return Array.from(totals.entries())
    .map(([name, value]) => ({
      name,
      color: colorByName.get(name) ?? "#64748b",
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function buildTrendForLastNDays(transactions: Transaction[], days: number) {
  const scoped = filterLastNDays(transactions, days);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const sameDay = scoped.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
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
      const transactionDate = new Date(transaction.date);
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

const PERSONAL_INCOME_COLOR = "#10b981";
const PERSONAL_EXPENSE_COLOR = "#ef4444";
const TREND_INCOME_COLORS = ["#6366f1", "#14b8a6", "#8b5cf6"] as const;
const TREND_EXPENSE_COLORS = ["#8b7fd4", "#f97316", "#ec4899"] as const;

function getPurposeTrendColors(purpose: Purpose, index: number) {
  if (purpose.id === PERSONAL_PURPOSE_ID) {
    return {
      income: PERSONAL_INCOME_COLOR,
      expense: PERSONAL_EXPENSE_COLOR,
    };
  }

  return {
    income: purpose.color ?? TREND_INCOME_COLORS[index % TREND_INCOME_COLORS.length],
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
        const transactionDate = new Date(transaction.date);
        return (
          transactionDate.toDateString() === date.toDateString() &&
          transactionMatchesPurpose(transaction.purpose, purpose.id, purposes)
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

export function computeNetWorthByPurpose(
  accounts: Account[],
  transactions: Transaction[],
  purposes: Purpose[],
) {
  const opening = accounts.reduce((sum, account) => sum + account.openingBalance, 0);

  return getActivePurposes(purposes).map((purpose) => {
    const scoped = transactions.filter((transaction) =>
      transactionMatchesPurpose(transaction.purpose, purpose.id, purposes),
    );
    const income = sumByType(scoped, "income");
    const expense = sumByType(scoped, "expense");

    return {
      purposeId: purpose.id,
      name: purpose.name,
      color: purpose.color ?? "#64748b",
      netWorth:
        openingBalanceForPurpose(opening, purpose.id) + income - expense,
      income,
      expense,
    };
  });
}

export function buildDashboardChartSnapshot(
  transactions: Transaction[],
  categories: Category[],
  days: 7 | 30,
) {
  const scoped = filterLastNDays(transactions, days);
  return {
    incomeExpenseTrend: buildTrendForLastNDays(transactions, days),
    topCategories: buildCategoryTotals(scoped, categories),
  };
}

export function buildDashboardData(
  scopedTransactions: Transaction[] = [],
  allTransactions: Transaction[] = [],
  accounts: Account[] = [],
  categories: Category[] = [],
  range: { dateFrom: string; dateTo: string },
  month = getCurrentPlanMonth(),
): DashboardData {
  const previousRange = getPreviousDateRange(range.dateFrom, range.dateTo);
  const previousPeriod = filterByDateRange(
    allTransactions,
    previousRange.dateFrom,
    previousRange.dateTo,
  );

  const periodIncome = sumByType(scopedTransactions, "income");
  const periodExpense = sumByType(scopedTransactions, "expense");
  const periodInvested = sumInvestments(scopedTransactions);
  const previousIncome = sumByType(previousPeriod, "income");
  const previousExpense = sumByType(previousPeriod, "expense");
  const periodSavings = periodIncome - periodExpense;
  const previousSavings = previousIncome - previousExpense;

  const rangeStart = new Date(range.dateFrom);
  const previousNetWorth =
    accounts.reduce((sum, account) => sum + account.openingBalance, 0) +
    sumByType(
      allTransactions.filter(
        (transaction) => new Date(transaction.date) < rangeStart,
      ),
      "income",
    ) -
    sumByType(
      allTransactions.filter(
        (transaction) => new Date(transaction.date) < rangeStart,
      ),
      "expense",
    );

  const totalIncome = sumByType(allTransactions, "income");
  const totalExpense = sumByType(allTransactions, "expense");
  const netWorth =
    accounts.reduce((sum, account) => sum + account.openingBalance, 0) +
    totalIncome -
    totalExpense;

  const savingsRate =
    periodIncome > 0 ? Math.round((periodSavings / periodIncome) * 100) : 0;

  const rangeEnd = new Date(`${range.dateTo}T23:59:59`);
  const daysElapsed = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) +
      1,
  );
  const averageDailySpend = Math.round(periodExpense / daysElapsed);

  const categoryTotals = buildCategoryTotals(scopedTransactions, categories);
  const topCategory = categoryTotals[0] ?? null;
  const expenseRatio =
    periodIncome > 0
      ? Math.min(100, Math.round((periodExpense / periodIncome) * 100))
      : 0;

  const recentTransactions = [...scopedTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const highlights = recentTransactions.slice(0, 3).map((transaction, index) => ({
    label: `${transaction.type === "expense" ? "Expense" : "Income"} · ${transaction.merchant}`,
    tone:
      transaction.type === "income"
        ? ("success" as const)
        : index === 2
          ? ("warning" as const)
          : ("danger" as const),
    timestamp: transaction.date,
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
      netWorthSparkline: buildSparkline(allTransactions, month, "net", accounts),
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
    incomeExpenseTrend30: buildTrendForLastNDays(allTransactions, 30),
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