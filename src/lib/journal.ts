import { sumPlanned } from "@/lib/plan";
import type { MonthlyPlan, Transaction } from "@/types";

export function getWeekStart(date = new Date()) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10);
}

export function getWeekEnd(weekStart: string) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatWeekLabel(weekStart: string) {
  const start = new Date(weekStart);
  const end = getWeekEnd(weekStart);
  const startLabel = start.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
  });
  const endLabel = end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Week of ${startLabel} – ${endLabel}`;
}

export function getWeekOptions(count = 12) {
  const current = getWeekStart();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current);
    date.setDate(date.getDate() - index * 7);
    const weekStart = getWeekStart(date);
    return {
      value: weekStart,
      label: formatWeekLabel(weekStart),
    };
  });
}

export function isReflectionDue(weekStart: string, hasReflection: boolean) {
  if (hasReflection) return false;
  const now = new Date();
  const currentWeek = getWeekStart(now);
  if (weekStart !== currentWeek) return false;
  return now.getDay() === 0 || now.getDay() >= 5;
}

export function getReflectionStatus(
  weekStart: string,
  hasReflection: boolean,
) {
  if (hasReflection) return "Completed ✓";
  if (isReflectionDue(weekStart, false)) return "Reflection due this week";
  return "Reflection opens this week";
}

export function filterTransactionsForWeek(
  transactions: Transaction[],
  weekStart: string,
) {
  const start = new Date(weekStart);
  const end = getWeekEnd(weekStart);

  return transactions.filter((transaction) => {
    const date = new Date(transaction.transactionDate);
    return date >= start && date <= end;
  });
}

export function calculateWeeklyPlanAdherence(
  transactions: Transaction[],
  weekStart: string,
  plan: MonthlyPlan | null | undefined,
) {
  if (!plan) return 0;

  const plannedTotal = sumPlanned(plan.allocations);
  if (plannedTotal <= 0) return 0;

  const weekStartDate = new Date(weekStart);
  const daysInMonth = new Date(
    weekStartDate.getFullYear(),
    weekStartDate.getMonth() + 1,
    0,
  ).getDate();
  const weeklyBudget = Math.round((plannedTotal / daysInMonth) * 7);

  const weekSpend = filterTransactionsForWeek(transactions, weekStart)
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

  if (weeklyBudget <= 0) return 0;
  if (weekSpend <= weeklyBudget) {
    return Math.round((weekSpend / weeklyBudget) * 100);
  }

  const overshoot = weekSpend - weeklyBudget;
  return Math.max(0, Math.round(100 - (overshoot / weeklyBudget) * 100));
}

export function getStandoutTransactions(
  transactions: Transaction[],
  weekStart: string,
  limit = 3,
) {
  return filterTransactionsForWeek(transactions, weekStart)
    .filter((transaction) => transaction.type === "expense")
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit)
    .map(
      (transaction) =>
        `${transaction.merchant} · ${transaction.category} · ₹${transaction.totalAmount.toLocaleString("en-IN")}`,
    );
}

export function getMonthReflections<T extends { weekStart: string }>(
  reflections: T[],
  month: string,
) {
  const [year, monthIndex] = month.split("-").map(Number);
  return reflections.filter((reflection) => {
    const date = new Date(reflection.weekStart);
    return (
      date.getFullYear() === year && date.getMonth() + 1 === monthIndex
    );
  });
}