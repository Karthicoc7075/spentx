import { calculateDailySafeSpending } from "@/lib/calculators/dailyLimit";
import {
  filterTransactionsForWeek,
  getWeekStart,
  isReflectionDue,
} from "@/lib/journal";
import { getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import type {
  MonthlyPlan,
  Reflection,
  SmartAlert,
  Transaction,
} from "@/types";

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function monthExpenses(transactions: Transaction[], month = getCurrentPlanMonth()) {
  const [year, monthIndex] = month.split("-").map(Number);
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "expense") return false;
      const date = new Date(transaction.date);
      return (
        date.getFullYear() === year && date.getMonth() + 1 === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function monthIncome(transactions: Transaction[], month = getCurrentPlanMonth()) {
  const [year, monthIndex] = month.split("-").map(Number);
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "income") return false;
      const date = new Date(transaction.date);
      return (
        date.getFullYear() === year && date.getMonth() + 1 === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function generateSmartAlerts({
  transactions,
  monthlyPlan,
  reflections = [],
  now = new Date(),
}: {
  transactions: Transaction[];
  monthlyPlan?: MonthlyPlan | null;
  reflections?: Reflection[];
  now?: Date;
}): Omit<SmartAlert, "userId" | "read">[] {
  const alerts: Omit<SmartAlert, "userId" | "read">[] = [];
  const month = getCurrentPlanMonth();
  const plannedTotal = monthlyPlan ? sumPlanned(monthlyPlan.allocations) : 0;
  const spent = monthExpenses(transactions, month);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  if (plannedTotal > 0 && dayOfMonth <= Math.ceil(daysInMonth / 2)) {
    const usageRatio = spent / plannedTotal;
    if (usageRatio > 0.5) {
      const projected = Math.round((spent / dayOfMonth) * daysInMonth);
      const overshoot = Math.max(0, projected - plannedTotal);
      alerts.push({
        id: `burn-rate-${month}`,
        type: "burn-rate",
        title: "Burn rate warning",
        message: `You've used ${Math.round(usageRatio * 100)}% of your Monthly Plan in only ${dayOfMonth} days.${overshoot > 0 ? ` You may overspend by ${formatInr(overshoot)}.` : ""}`,
        severity: "high",
        createdAt: now.toISOString(),
      });
    }
  }

  if (monthlyPlan) {
    const weekStart = getWeekStart(now);
    const weekTransactions = filterTransactionsForWeek(transactions, weekStart);
    const weeklyBudgetFactor = 7 / daysInMonth;

    for (const allocation of monthlyPlan.allocations) {
      if (allocation.plannedAmount <= 0) continue;

      const weeklyPlanned = allocation.plannedAmount * weeklyBudgetFactor;
      const weekSpend = weekTransactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.category === allocation.category,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      if (weeklyPlanned > 0 && weekSpend > weeklyPlanned * 1.2) {
        const deviation = Math.round(
          ((weekSpend - weeklyPlanned) / weeklyPlanned) * 100,
        );
        alerts.push({
          id: `plan-deviation-${allocation.category}-${weekStart}`,
          type: "plan-deviation",
          title: "Plan deviation",
          message: `Your ${allocation.category} spending is ${deviation}% higher than planned this week.`,
          severity: "high",
          createdAt: now.toISOString(),
        });
      }

      const monthCategorySpend = transactions
        .filter(
          (transaction) =>
            transaction.type === "expense" &&
            transaction.category === allocation.category &&
            transaction.date.startsWith(month),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      const usage = monthCategorySpend / allocation.plannedAmount;
      if (usage >= 1) {
        alerts.push({
          id: `budget-threshold-${allocation.category}-${month}-100`,
          type: "budget-threshold",
          title: "Budget limit reached",
          message: `You've used 100% of your ${allocation.category} allocation.`,
          severity: "medium",
          createdAt: now.toISOString(),
        });
      } else if (usage >= 0.8) {
        alerts.push({
          id: `budget-threshold-${allocation.category}-${month}-80`,
          type: "budget-threshold",
          title: "Budget threshold",
          message: `You've used ${Math.round(usage * 100)}% of your ${allocation.category} allocation. Only ${formatInr(allocation.plannedAmount - monthCategorySpend)} left.`,
          severity: "medium",
          createdAt: now.toISOString(),
        });
      }
    }
  }

  const dailyLimit = calculateDailySafeSpending({
    plannedTotal,
    transactions,
    month,
    referenceDate: now,
  });

  if (dailyLimit.status === "overspent" && dailyLimit.overspentAmount > 0) {
    alerts.push({
      id: `daily-limit-${now.toISOString().slice(0, 10)}`,
      type: "daily-limit",
      title: "Daily limit exceeded",
      message: `You've exceeded today's safe limit by ${formatInr(dailyLimit.overspentAmount)}. Try to adjust tomorrow.`,
      severity: "medium",
      createdAt: now.toISOString(),
    });
  }

  const currentWeek = getWeekStart(now);
  const hasReflection = reflections.some(
    (reflection) => reflection.weekStart === currentWeek,
  );
  if (isReflectionDue(currentWeek, hasReflection)) {
    alerts.push({
      id: `reflection-reminder-${currentWeek}`,
      type: "reflection-reminder",
      title: "Weekly reflection due",
      message:
        "It's Sunday. Take 2 minutes to complete your Weekly Reflection.",
      severity: "low",
      createdAt: now.toISOString(),
    });
  }

  const salaryTxn = transactions.find((transaction) => {
    if (transaction.type !== "income") return false;
    const date = new Date(transaction.date);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear() &&
      (transaction.category === "Salary" ||
        transaction.merchant.toLowerCase().includes("payroll") ||
        transaction.merchant.toLowerCase().includes("salary"))
    );
  });

  if (salaryTxn) {
    alerts.push({
      id: `income-salary-${month}`,
      type: "income",
      title: "Salary credited",
      message: `Salary credited from ${salaryTxn.merchant}. Your Monthly Plan is ready to begin.`,
      severity: "medium",
      createdAt: salaryTxn.date,
    });
  } else if (monthIncome(transactions, month) > 0 && plannedTotal > 0) {
    alerts.push({
      id: `income-detected-${month}`,
      type: "income",
      title: "Income received",
      message: `${formatInr(monthIncome(transactions, month))} income logged this month. Review your plan allocations.`,
      severity: "medium",
      createdAt: now.toISOString(),
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  return alerts.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function mergeAlerts(
  generated: Omit<SmartAlert, "userId" | "read">[],
  stored: SmartAlert[],
): SmartAlert[] {
  const storedById = new Map(stored.map((alert) => [alert.id, alert]));

  return generated.map((alert) => {
    const existing = storedById.get(alert.id);
    return {
      ...alert,
      read: existing?.read ?? false,
      createdAt: existing?.createdAt ?? alert.createdAt,
    };
  });
}