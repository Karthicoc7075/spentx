import { computeFriendSplitNetBalances } from "@/lib/friend-splits";
import { calculateDailySafeSpending } from "@/lib/calculators/dailyLimit";
import {
  filterTransactionsForWeek,
  getWeekStart,
  isReflectionDue,
} from "@/lib/journal";
import { getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import type {
  FriendSplit,
  MonthlyPlan,
  NotificationPreferences,
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
      const date = new Date(transaction.transactionDate);
      return (
        date.getFullYear() === year && date.getMonth() + 1 === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
}

function monthIncome(transactions: Transaction[], month = getCurrentPlanMonth()) {
  const [year, monthIndex] = month.split("-").map(Number);
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "income") return false;
      const date = new Date(transaction.transactionDate);
      return (
        date.getFullYear() === year && date.getMonth() + 1 === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
}

function getTopCategory(transactions: Transaction[]) {
  const categoryTotals: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + t.totalAmount;
  }
  let topName = "";
  let topAmount = 0;
  for (const [cat, amt] of Object.entries(categoryTotals)) {
    if (amt > topAmount) {
      topAmount = amt;
      topName = cat;
    }
  }
  return topName ? { name: topName, amount: topAmount } : null;
}

export function generateSmartAlerts({
  transactions,
  monthlyPlan,
  reflections = [],
  friendSplits = [],
  hasTodaySnapshot = true,
  notificationPreferences = {},
  now = new Date(),
}: {
  transactions: Transaction[];
  monthlyPlan?: MonthlyPlan | null;
  reflections?: Reflection[];
  friendSplits?: FriendSplit[];
  hasTodaySnapshot?: boolean;
  notificationPreferences?: NotificationPreferences;
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

  const prefs = notificationPreferences;

  // 1. Burn rate warning
  if (prefs.burnRateAlerts !== false && plannedTotal > 0 && dayOfMonth <= Math.ceil(daysInMonth / 2)) {
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

  // 2. Monthly plan deviations & budget thresholds
  if (monthlyPlan && prefs.budgetAlerts !== false) {
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
        .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

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
            transaction.transactionDate.startsWith(month),
        )
        .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

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

  // 3. Daily safe limit
  if (prefs.dailyLimitAlerts !== false) {
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
  }

  // 4. Weekly reflection reminder
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

  // 5. Income & Salary Alerts
  if (prefs.salaryAlerts !== false) {
    const salaryTxn = transactions.find((transaction) => {
      if (transaction.type !== "income") return false;
      const date = new Date(transaction.transactionDate);
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
        createdAt: salaryTxn.transactionDate,
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
  }

  // 6. Daily Spending Summary
  if (prefs.dailySummary !== false) {
    const todayStr = now.toISOString().slice(0, 10);
    const todayTxns = transactions.filter(
      (t) => t.transactionDate.startsWith(todayStr) && t.type === "expense",
    );
    const todaySpent = todayTxns.reduce((sum, t) => sum + t.totalAmount, 0);
    const topCat = getTopCategory(todayTxns);

    let summaryMsg = "";
    if (todaySpent > 0) {
      summaryMsg = `Today you spent ${formatInr(todaySpent)} across ${todayTxns.length} transaction${todayTxns.length === 1 ? "" : "s"}.${topCat ? ` Top category: ${topCat.name} (${formatInr(topCat.amount)}).` : ""}`;
    } else {
      summaryMsg = "No-spend day! 🎉 You spent ₹0 today. Great job keeping your budget on track.";
    }

    alerts.push({
      id: `daily-summary-${todayStr}`,
      type: "daily-summary",
      title: "Daily spending summary",
      message: summaryMsg,
      severity: "low",
      createdAt: now.toISOString(),
    });
  }

  // 7. Weekly Spending Summary
  if (prefs.weeklySummary !== false) {
    const weekStart = getWeekStart(now);
    const weekTxns = filterTransactionsForWeek(transactions, weekStart);
    const weekExpenses = weekTxns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const weekIncome = weekTxns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const topCat = getTopCategory(weekTxns);

    alerts.push({
      id: `weekly-summary-${weekStart}`,
      type: "weekly-summary",
      title: "Weekly spending summary",
      message: `This week: ${formatInr(weekExpenses)} spent, ${formatInr(weekIncome)} income.${topCat ? ` Highest category: ${topCat.name} (${formatInr(topCat.amount)}).` : ""}`,
      severity: "low",
      createdAt: now.toISOString(),
    });
  }

  // 8. Monthly Spending Summary
  if (prefs.monthlySummary !== false) {
    const mExpenses = spent;
    const mIncome = monthIncome(transactions, month);
    const mSavings = Math.max(0, mIncome - mExpenses);
    const monthTxns = transactions.filter(
      (t) => t.transactionDate.startsWith(month) && t.type === "expense",
    );
    const topCat = getTopCategory(monthTxns);
    const monthName = now.toLocaleString("default", { month: "long" });

    alerts.push({
      id: `monthly-summary-${month}`,
      type: "monthly-summary",
      title: `${monthName} summary`,
      message: `Income: ${formatInr(mIncome)} · Expenses: ${formatInr(mExpenses)} · Saved: ${formatInr(mSavings)}.${topCat ? ` Top category: ${topCat.name} (${formatInr(topCat.amount)}).` : ""}`,
      severity: "low",
      createdAt: now.toISOString(),
    });
  }

  // 9. Friend Settlement Reminders
  if (prefs.settlementReminders !== false && friendSplits.length > 0) {
    const netBalances = computeFriendSplitNetBalances(friendSplits, []);
    for (const item of netBalances) {
      if (Math.abs(item.balance) >= 1) {
        const absVal = Math.round(Math.abs(item.balance));
        const relationshipStr =
          item.balance > 0
            ? `${item.name} owes you ${formatInr(absVal)}`
            : `You owe ${item.name} ${formatInr(absVal)}`;
        alerts.push({
          id: `settlement-reminder-${item.key}`,
          type: "settlement-reminder",
          title: "Friend settlement reminder",
          message: `Pending balance: ${relationshipStr}.`,
          severity: "medium",
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // 10. Daily Snapshot Reminder
  if (prefs.snapshotReminders !== false && !hasTodaySnapshot) {
    const todayStr = now.toISOString().slice(0, 10);
    alerts.push({
      id: `snapshot-reminder-${todayStr}`,
      type: "snapshot-reminder",
      title: "Daily balance snapshot reminder",
      message: "Take a moment to update your daily account balance snapshot in Wealth to keep net worth tracking accurate.",
      severity: "low",
      createdAt: now.toISOString(),
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = alerts.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Daily rate limit: max 8 notifications per day (SMS detections are separate & unlimited)
  return sorted.slice(0, 8);
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