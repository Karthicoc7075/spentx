import {
  calculateDailySafeSpending,
  isTransactionInMonth,
} from "@/lib/calculators/dailyLimit";
import { isSpendingExpense, sumSpendingExpenses } from "@/lib/investments";
import { formatPlanMonth, getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import type { MonthlyPlan, Transaction } from "@/types";

const BILL_CATEGORIES = new Set([
  "Rent",
  "Utilities",
  "Subscriptions",
  "Health",
  "Insurance",
]);

const SALARY_CATEGORIES = new Set(["Salary", "Freelance"]);

export type FinancialHealthLevel = "excellent" | "attention" | "action";

export type FinancialHealthData = {
  month: string;
  monthLabel: string;
  income: number;
  expense: number;
  scoreAvailable: boolean;
  score: number;
  level: FinancialHealthLevel;
  levelLabel: string;
  scoreFactors: string[];
  dailySpending: {
    hasPlan: boolean;
    safeLimit: number;
    todaySpent: number;
    status: "good" | "warning" | "over";
    statusLabel: string;
    overspentAmount: number;
  };
  monthlyPlan: {
    hasPlan: boolean;
    planned: number;
    spent: number;
    status: "on-track" | "close" | "over" | "no-plan";
    statusLabel: string;
  };
  savings: {
    amount: number;
    rate: number;
    deltaLabel: string | null;
  };
  indianMetrics: {
    salaryReceived: boolean;
    salaryDateLabel: string | null;
    upiSpendPercent: number;
    billsPaidCount: number;
    hasSipActivity: boolean;
  };
  highlights: string[];
};

function filterMonthTransactions(transactions: Transaction[], month: string) {
  return transactions.filter((transaction) =>
    isTransactionInMonth(transaction, month),
  );
}

function sumByType(transactions: Transaction[], type: Transaction["type"]) {
  if (type === "expense") {
    return sumSpendingExpenses(transactions);
  }

  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export type HealthScoreMetrics = {
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
  budgetUtilization: number;
  daysUnderSafeLimit: number;
  daysTracked: number;
  avgDailySpend: number;
};

function getDaysTrackedInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex - 1;
  return isCurrentMonth ? today.getDate() : daysInMonth;
}

export function countDaysOverSafeLimit(
  transactions: Transaction[],
  month: string,
  dailySafeLimit: number,
) {
  if (dailySafeLimit <= 0) return 0;

  const daysTracked = getDaysTrackedInMonth(month);
  let daysOver = 0;

  for (let day = 1; day <= daysTracked; day += 1) {
    const daySpend = transactions
      .filter(
        (transaction) =>
          isSpendingExpense(transaction) &&
          isTransactionInMonth(transaction, month) &&
          new Date(transaction.date).getDate() === day,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (daySpend > dailySafeLimit) {
      daysOver += 1;
    }
  }

  return daysOver;
}

export function buildHealthScoreMetrics(input: {
  month: string;
  income: number;
  expense: number;
  planned: number;
  dailySafeLimit: number;
  transactions: Transaction[];
}): HealthScoreMetrics {
  const savings = input.income - input.expense;
  const savingsRate =
    input.income > 0 ? Math.round((savings / input.income) * 100) : 0;

  const budgetUtilization =
    input.planned > 0
      ? Math.round((input.expense / input.planned) * 100)
      : input.income > 0
        ? Math.round((input.expense / input.income) * 100)
        : 0;

  const daysTracked = getDaysTrackedInMonth(input.month);
  const effectiveDailyLimit =
    input.dailySafeLimit > 0
      ? input.dailySafeLimit
      : input.income > 0
        ? Math.round(input.income / daysTracked)
        : 0;

  const daysOverSafeLimit = countDaysOverSafeLimit(
    input.transactions,
    input.month,
    effectiveDailyLimit,
  );
  const daysUnderSafeLimit = Math.max(0, daysTracked - daysOverSafeLimit);

  return {
    income: input.income,
    expense: input.expense,
    savings,
    savingsRate,
    budgetUtilization,
    daysUnderSafeLimit,
    daysTracked,
    avgDailySpend:
      daysTracked > 0 ? Math.round(input.expense / daysTracked) : 0,
  };
}

export function calculateBaseHealthScore(metrics: HealthScoreMetrics) {
  const { savingsRate, budgetUtilization, daysUnderSafeLimit } = metrics;

  let score = 50;

  if (savingsRate >= 40) score += 25;
  else if (savingsRate >= 25) score += 15;
  else if (savingsRate >= 10) score += 5;
  else if (savingsRate < 0) score -= 15;

  if (budgetUtilization <= 70) score += 15;
  else if (budgetUtilization <= 90) score += 8;
  else if (budgetUtilization > 100) score -= 10;

  if (daysUnderSafeLimit >= 25) score += 10;
  else if (daysUnderSafeLimit >= 20) score += 5;

  return Math.min(100, Math.max(0, score));
}

export function resolveFinalHealthScore(
  baseScore: number,
  aiScore?: number | null,
) {
  if (aiScore == null || Number.isNaN(aiScore)) {
    return baseScore;
  }

  const clamped = Math.min(100, Math.max(0, Math.round(aiScore)));
  if (Math.abs(clamped - baseScore) > 25) {
    return Math.round(clamped * 0.65 + baseScore * 0.35);
  }
  return clamped;
}

function getHealthLevel(score: number): FinancialHealthLevel {
  if (score >= 75) return "excellent";
  if (score >= 55) return "attention";
  return "action";
}

function getLevelLabel(level: FinancialHealthLevel) {
  if (level === "excellent") return "Good Financial Health";
  if (level === "attention") return "Needs Attention";
  return "Action Needed";
}

function getPlanStatus(spent: number, planned: number) {
  if (planned <= 0) {
    return { status: "no-plan" as const, statusLabel: "No plan saved" };
  }

  const ratio = spent / planned;
  if (ratio <= 0.92) {
    return { status: "on-track" as const, statusLabel: "✓ On Track" };
  }
  if (ratio <= 1.05) {
    return { status: "close" as const, statusLabel: "⚠ Close to Plan Limit" };
  }
  return { status: "over" as const, statusLabel: "⚠ Over Plan" };
}

function getDailyStatus(dailyLimit: ReturnType<typeof calculateDailySafeSpending>) {
  if (!dailyLimit.hasPlan) {
    return {
      status: "warning" as const,
      statusLabel: "Set a monthly plan",
      overspentAmount: 0,
    };
  }

  if (dailyLimit.overspentAmount > 0) {
    return {
      status: "over" as const,
      statusLabel: `⚠ ₹${dailyLimit.overspentAmount.toLocaleString("en-IN")} above today's limit`,
      overspentAmount: dailyLimit.overspentAmount,
    };
  }

  return {
    status: "good" as const,
    statusLabel: "✓ Within Limit",
    overspentAmount: 0,
  };
}

function findWorstCategoryOverPlan(
  monthExpenses: Transaction[],
  plan: MonthlyPlan | null | undefined,
) {
  if (!plan) return null;

  let worst: { category: string; overBy: number } | null = null;

  for (const allocation of plan.allocations) {
    if (allocation.plannedAmount <= 0) continue;
    const actual = monthExpenses
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          transaction.category === allocation.category,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const overBy = actual - allocation.plannedAmount;
    if (overBy > 0 && (!worst || overBy > worst.overBy)) {
      worst = { category: allocation.category, overBy };
    }
  }

  return worst;
}

function buildHighlights(input: {
  dailyLimit: ReturnType<typeof calculateDailySafeSpending>;
  monthExpenses: Transaction[];
  monthIncome: number;
  monthExpense: number;
  savings: number;
  plan: MonthlyPlan | null | undefined;
  salaryDateLabel: string | null;
  upiSpendPercent: number;
  previousMonthLabel: string;
  previousSavingsRate: number;
  currentSavingsRate: number;
}) {
  const highlights: string[] = [];

  if (input.dailyLimit.hasPlan && input.dailyLimit.remainingBudget > 0) {
    highlights.push(
      `₹${input.dailyLimit.remainingBudget.toLocaleString("en-IN")} available for the rest of this month.`,
    );
  }

  const worstCategory = findWorstCategoryOverPlan(
    input.monthExpenses,
    input.plan,
  );
  if (worstCategory) {
    highlights.push(
      `${worstCategory.category} spending is ₹${worstCategory.overBy.toLocaleString("en-IN")} above your monthly plan.`,
    );
  }

  if (input.salaryDateLabel) {
    highlights.push(`Salary received on ${input.salaryDateLabel}.`);
  }

  if (input.upiSpendPercent >= 40) {
    highlights.push(
      `UPI transactions account for ${input.upiSpendPercent}% of your expenses.`,
    );
  }

  if (
    input.dailyLimit.monthEndProjection !== null &&
    input.dailyLimit.monthEndProjection > 0 &&
    input.monthIncome > 0
  ) {
    highlights.push(
      `Current trend suggests you may save around ₹${input.dailyLimit.monthEndProjection.toLocaleString("en-IN")} this month.`,
    );
  } else if (input.savings > 0) {
    highlights.push(
      `You have saved ₹${input.savings.toLocaleString("en-IN")} so far this month.`,
    );
  }

  const savingsDelta = input.currentSavingsRate - input.previousSavingsRate;
  if (Math.abs(savingsDelta) >= 3 && highlights.length < 4) {
    const direction = savingsDelta > 0 ? "↑" : "↓";
    highlights.push(
      `Savings rate is ${direction} ${Math.abs(savingsDelta)}% compared to ${input.previousMonthLabel}.`,
    );
  }

  if (highlights.length === 0) {
    highlights.push("Add income and expenses to unlock personalised financial highlights.");
  }

  return highlights.slice(0, 4);
}

function getPreviousMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 2, 1);
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return {
    month: value,
    label: formatPlanMonth(value),
  };
}

export function buildFinancialHealth(
  transactions: Transaction[],
  plan: MonthlyPlan | null | undefined,
  month = getCurrentPlanMonth(),
  investments: Array<{ type: string }> = [],
): FinancialHealthData {
  const monthTransactions = filterMonthTransactions(transactions, month);
  const monthExpenses = monthTransactions.filter(isSpendingExpense);
  const monthIncome = sumByType(monthTransactions, "income");
  const monthExpense = sumByType(monthTransactions, "expense");
  const savings = monthIncome - monthExpense;
  const savingsRate =
    monthIncome > 0 ? Math.round((savings / monthIncome) * 100) : 0;

  const planned = plan ? sumPlanned(plan.allocations) : 0;
  const dailyLimit = calculateDailySafeSpending({
    plannedTotal: planned,
    transactions,
    month,
  });

  const previous = getPreviousMonth(month);
  const previousTransactions = filterMonthTransactions(
    transactions,
    previous.month,
  );
  const previousIncome = sumByType(previousTransactions, "income");
  const previousExpense = sumByType(previousTransactions, "expense");
  const previousSavingsRate =
    previousIncome > 0
      ? Math.round(((previousIncome - previousExpense) / previousIncome) * 100)
      : 0;

  const scoreAvailable = monthIncome > 0 || monthExpense > 0;

  const healthMetrics = buildHealthScoreMetrics({
    month,
    income: monthIncome,
    expense: monthExpense,
    planned,
    dailySafeLimit: dailyLimit.dailySafeLimit,
    transactions,
  });

  const score = scoreAvailable
    ? calculateBaseHealthScore(healthMetrics)
    : 0;

  const level = scoreAvailable ? getHealthLevel(score) : "attention";
  const planStatus = getPlanStatus(dailyLimit.monthSpent, planned);
  const dailyStatus = getDailyStatus(dailyLimit);

  const salaryTxn = monthTransactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        SALARY_CATEGORIES.has(transaction.category),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const salaryDateLabel = salaryTxn
    ? new Date(salaryTxn.date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
      })
    : null;

  const mobileSpend = monthExpenses
    .filter((transaction) => transaction.source === "mobile")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const upiSpendPercent =
    monthExpense > 0 ? Math.round((mobileSpend / monthExpense) * 100) : 0;

  const billsPaidCount = new Set(
    monthExpenses
      .filter((transaction) => BILL_CATEGORIES.has(transaction.category))
      .map((transaction) => transaction.category),
  ).size;

  const savingsDelta = savingsRate - previousSavingsRate;
  const savingsDeltaLabel =
    previousIncome > 0 && Math.abs(savingsDelta) >= 1
      ? `${savingsDelta > 0 ? "↑" : "↓"} ${Math.abs(savingsDelta)}% compared to ${previous.label}`
      : null;

  return {
    month,
    monthLabel: formatPlanMonth(month),
    income: monthIncome,
    expense: monthExpense,
    scoreAvailable,
    score,
    level,
    levelLabel: scoreAvailable ? getLevelLabel(level) : "Score not available",
    scoreFactors: [
      "Savings rate",
      "Budget utilization",
      "Safe spending discipline",
    ],
    dailySpending: {
      hasPlan: dailyLimit.hasPlan,
      safeLimit: dailyLimit.dailySafeLimit,
      todaySpent: dailyLimit.todaySpent,
      status: dailyStatus.status,
      statusLabel: dailyStatus.statusLabel,
      overspentAmount: dailyStatus.overspentAmount,
    },
    monthlyPlan: {
      hasPlan: planned > 0,
      planned,
      spent: dailyLimit.monthSpent,
      status: planStatus.status,
      statusLabel: planStatus.statusLabel,
    },
    savings: {
      amount: savings,
      rate: savingsRate,
      deltaLabel: savingsDeltaLabel,
    },
    indianMetrics: {
      salaryReceived: Boolean(salaryTxn),
      salaryDateLabel,
      upiSpendPercent,
      billsPaidCount,
      hasSipActivity: investments.some((item) => item.type === "mutual-fund"),
    },
    highlights: buildHighlights({
      dailyLimit,
      monthExpenses,
      monthIncome,
      monthExpense,
      savings,
      plan,
      salaryDateLabel,
      upiSpendPercent,
      previousMonthLabel: previous.label,
      previousSavingsRate,
      currentSavingsRate: savingsRate,
    }),
  };
}