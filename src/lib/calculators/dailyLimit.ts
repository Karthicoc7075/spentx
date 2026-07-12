import { getCurrentPlanMonth } from "@/lib/plan";
import { isSpendingExpense } from "@/lib/investments";
import type { Transaction } from "@/types";

export type DailyLimitStatus = "no-plan" | "on-track" | "overspent" | "month-complete";

export type DailyLimitInput = {
  plannedTotal: number;
  transactions: Transaction[];
  month?: string;
  referenceDate?: Date;
};

export type DailyLimitResult = {
  hasPlan: boolean;
  month: string;
  dailySafeLimit: number;
  remainingBudget: number;
  daysLeft: number;
  todaySpent: number;
  remainingToday: number;
  todayProgress: number;
  status: DailyLimitStatus;
  message: string;
  overspentAmount: number;
  suggestedDailyReduction: number;
  recoveryDays: number;
  monthSpent: number;
  monthEndProjection: number | null;
  monthEndLabel: string | null;
};

function parsePlanMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return { year, monthIndex: monthIndex - 1 };
}

export function getDaysLeftInMonth(referenceDate: Date, month?: string) {
  const activeMonth = month ?? getCurrentPlanMonth();
  const { year, monthIndex } = parsePlanMonth(activeMonth);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  if (
    referenceDate.getFullYear() !== year ||
    referenceDate.getMonth() !== monthIndex
  ) {
    return lastDay;
  }

  return Math.max(1, lastDay - referenceDate.getDate() + 1);
}

export function isTransactionInMonth(transaction: Transaction, month: string) {
  const date = new Date(transaction.date);
  const { year, monthIndex } = parsePlanMonth(month);
  return date.getFullYear() === year && date.getMonth() === monthIndex;
}

export function isTransactionOnDate(transaction: Transaction, referenceDate: Date) {
  const date = new Date(transaction.date);
  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
}

export function sumMonthExpenses(
  transactions: Transaction[],
  month: string,
  referenceDate?: Date,
) {
  const cutoff = referenceDate ?? new Date();

  return transactions
    .filter(
      (transaction) =>
        isSpendingExpense(transaction) &&
        isTransactionInMonth(transaction, month) &&
        new Date(transaction.date) <= cutoff,
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumTodayExpenses(
  transactions: Transaction[],
  referenceDate: Date,
  month: string,
) {
  return transactions
    .filter(
      (transaction) =>
        isSpendingExpense(transaction) &&
        isTransactionInMonth(transaction, month) &&
        isTransactionOnDate(transaction, referenceDate),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function buildRecoveryAdvice(
  overspentAmount: number,
  dailySafeLimit: number,
  daysLeft: number,
) {
  if (overspentAmount <= 0 || daysLeft <= 1) {
    return { suggestedDailyReduction: overspentAmount, recoveryDays: 1 };
  }

  const recoveryDays = Math.min(
    daysLeft - 1,
    Math.max(2, Math.ceil(overspentAmount / Math.max(dailySafeLimit, 1))),
  );

  return {
    suggestedDailyReduction: Math.ceil(overspentAmount / recoveryDays),
    recoveryDays,
  };
}

function buildDailyLimitMessage(
  status: DailyLimitStatus,
  overspentAmount: number,
  suggestedDailyReduction: number,
  recoveryDays: number,
) {
  if (status === "no-plan") {
    return "Create a monthly plan to unlock your daily safe spending limit.";
  }

  if (status === "month-complete") {
    return "This month’s plan budget has been fully used.";
  }

  if (status === "overspent") {
    if (recoveryDays <= 1) {
      return `You overspent by ₹${overspentAmount.toLocaleString("en-IN")} today. Try to reduce tomorrow’s spending by ₹${suggestedDailyReduction.toLocaleString("en-IN")}.`;
    }

    return `You spent ₹${overspentAmount.toLocaleString("en-IN")} more today. Consider reducing spending by ₹${suggestedDailyReduction.toLocaleString("en-IN")} over the next ${recoveryDays} days to stay on track.`;
  }

  return "You’re on track today";
}

export function calculateDailySafeSpending({
  plannedTotal,
  transactions,
  month = getCurrentPlanMonth(),
  referenceDate = new Date(),
}: DailyLimitInput): DailyLimitResult {
  if (plannedTotal <= 0) {
    return {
      hasPlan: false,
      month,
      dailySafeLimit: 0,
      remainingBudget: 0,
      daysLeft: getDaysLeftInMonth(referenceDate, month),
      todaySpent: 0,
      remainingToday: 0,
      todayProgress: 0,
      status: "no-plan",
      message: buildDailyLimitMessage("no-plan", 0, 0, 0),
      overspentAmount: 0,
      suggestedDailyReduction: 0,
      recoveryDays: 0,
      monthSpent: 0,
      monthEndProjection: null,
      monthEndLabel: null,
    };
  }

  const daysLeft = getDaysLeftInMonth(referenceDate, month);
  const monthSpent = sumMonthExpenses(transactions, month, referenceDate);
  const remainingBudget = Math.max(0, plannedTotal - monthSpent);
  const todaySpent = sumTodayExpenses(transactions, referenceDate, month);
  const dailySafeLimit =
    daysLeft > 0 ? Math.round(remainingBudget / daysLeft) : remainingBudget;
  const remainingToday = dailySafeLimit - todaySpent;
  const todayProgress =
    dailySafeLimit > 0
      ? Math.min(150, Math.round((todaySpent / dailySafeLimit) * 100))
      : todaySpent > 0
        ? 100
        : 0;

  const overspentAmount = Math.max(0, todaySpent - dailySafeLimit);
  const { suggestedDailyReduction, recoveryDays } = buildRecoveryAdvice(
    overspentAmount,
    dailySafeLimit,
    daysLeft,
  );

  let status: DailyLimitStatus = "on-track";
  if (remainingBudget <= 0 && monthSpent >= plannedTotal) {
    status = "month-complete";
  } else if (overspentAmount > 0) {
    status = "overspent";
  }

  const { year, monthIndex } = parsePlanMonth(month);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dayOfMonth = Math.max(
    1,
    referenceDate.getFullYear() === year &&
      referenceDate.getMonth() === monthIndex
      ? referenceDate.getDate()
      : daysInMonth,
  );
  const projectedMonthSpend = Math.round((monthSpent / dayOfMonth) * daysInMonth);
  const monthEndProjection = Math.max(0, plannedTotal - projectedMonthSpend);
  const monthEndDate = new Date(year, monthIndex + 1, 0);
  const monthEndLabel = monthEndDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
  });

  return {
    hasPlan: true,
    month,
    dailySafeLimit,
    remainingBudget,
    daysLeft,
    todaySpent,
    remainingToday,
    todayProgress,
    status,
    message: buildDailyLimitMessage(
      status,
      overspentAmount,
      suggestedDailyReduction,
      recoveryDays,
    ),
    overspentAmount,
    suggestedDailyReduction,
    recoveryDays,
    monthSpent,
    monthEndProjection,
    monthEndLabel,
  };
}

export function getDailyLimitInsight(result: DailyLimitResult) {
  if (!result.hasPlan) {
    return null;
  }

  if (result.status === "overspent") {
    return {
      tone: "warning" as const,
      message: `You’re ₹${result.overspentAmount.toLocaleString("en-IN")} over today’s safe limit.`,
    };
  }

  if (result.status === "month-complete") {
    return {
      tone: "warning" as const,
      message: "Your monthly plan budget is fully used.",
    };
  }

  if (result.remainingToday > 0) {
    return {
      tone: "success" as const,
      message: `You’re within today’s safe limit — ₹${result.remainingToday.toLocaleString("en-IN")} left for today.`,
    };
  }

  return {
    tone: "success" as const,
    message: "You’re within today’s safe limit.",
  };
}