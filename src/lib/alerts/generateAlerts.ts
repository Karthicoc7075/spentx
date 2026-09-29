import { computeFriendSplitNetBalances } from "@/lib/friend-splits";
import { calculateDailySafeSpending } from "@/lib/calculators/dailyLimit";
import { filterTransactionsForWeek, getWeekStart } from "@/lib/journal";
import { isOutingCompleted } from "@/lib/outing-display";
import { getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import type {
  FriendSettlement,
  FriendSplit,
  MonthlyPlan,
  NotificationPreferences,
  Outing,
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
  friendSplits = [],
  friendSettlements = [],
  outings = [],
  notificationPreferences = {},
  now = new Date(),
}: {
  transactions: Transaction[];
  monthlyPlan?: MonthlyPlan | null;
  reflections?: Reflection[];
  friendSplits?: FriendSplit[];
  friendSettlements?: FriendSettlement[];
  outings?: Outing[];
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
  const todayStr = now.toISOString().slice(0, 10);

  // 1. Daily safe spending limit exceeded (Essential & Actionable)
  if (prefs.dailyLimitAlerts !== false) {
    const dailyLimit = calculateDailySafeSpending({
      plannedTotal,
      transactions,
      month,
      referenceDate: now,
    });

    if (dailyLimit.status === "overspent" && dailyLimit.overspentAmount > 0) {
      alerts.push({
        id: `daily-limit-${todayStr}`,
        type: "daily-limit",
        title: "Daily limit exceeded",
        message: `You've exceeded today's safe spending limit by ${formatInr(dailyLimit.overspentAmount)}. Adjust your spending tomorrow to stay on track.`,
        severity: "high",
        createdAt: now.toISOString(),
      });
    }
  }

  // 2. Category budget threshold warnings (80% & 100%)
  if (monthlyPlan && prefs.budgetAlerts !== false) {
    for (const allocation of monthlyPlan.allocations) {
      if (allocation.plannedAmount <= 0) continue;

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
          message: `You've used 100% of your ${allocation.category} monthly budget (${formatInr(allocation.plannedAmount)}).`,
          severity: "high",
          createdAt: now.toISOString(),
        });
      } else if (usage >= 0.8) {
        alerts.push({
          id: `budget-threshold-${allocation.category}-${month}-80`,
          type: "budget-threshold",
          title: "Budget threshold warning",
          message: `You've used ${Math.round(usage * 100)}% of your ${allocation.category} allocation. Only ${formatInr(allocation.plannedAmount - monthCategorySpend)} remaining.`,
          severity: "medium",
          createdAt: now.toISOString(),
        });
      }
    }
  }

  // 3. High burn rate warning (Early warning in first half of month)
  if (prefs.burnRateAlerts !== false && plannedTotal > 0 && dayOfMonth <= Math.ceil(daysInMonth / 2)) {
    const usageRatio = spent / plannedTotal;
    if (usageRatio > 0.5) {
      const projected = Math.round((spent / dayOfMonth) * daysInMonth);
      const overshoot = Math.max(0, projected - plannedTotal);
      alerts.push({
        id: `burn-rate-${month}`,
        type: "burn-rate",
        title: "High burn rate warning",
        message: `You've spent ${Math.round(usageRatio * 100)}% of your Monthly Plan in only ${dayOfMonth} days.${overshoot > 0 ? ` Projected to overspend by ${formatInr(overshoot)}.` : ""}`,
        severity: "high",
        createdAt: now.toISOString(),
      });
    }
  }

  // 4. Outing completed & settlement ready
  if (prefs.outingAlerts !== false && outings.length > 0) {
    for (const outing of outings) {
      if (outing.isActive === false) continue;
      if (isOutingCompleted(outing, todayStr)) {
        const endStr = outing.endDate ? outing.endDate.slice(0, 10) : (outing.startDate ? outing.startDate.slice(0, 10) : "");
        if (endStr) {
          const endDateObj = new Date(endStr);
          const diffDays = Math.round((now.getTime() - endDateObj.getTime()) / (1000 * 60 * 60 * 24));
          // Notify for outings ended within the past 14 days
          if (diffDays >= 0 && diffDays <= 14) {
            alerts.push({
              id: `outing-completed-${outing.id}`,
              type: "outing-completed",
              title: "Outing completed",
              message: `"${outing.name}" has completed. Review final spending and settle splits with friends.`,
              severity: "medium",
              createdAt: `${endStr}T20:00:00.000Z`,
            });
          }
        }
      }
    }
  }

  // 5. Friend settlement reminders (Pending balances with friends)
  if (prefs.settlementReminders !== false && friendSplits.length > 0) {
    const netBalances = computeFriendSplitNetBalances(friendSplits, friendSettlements);
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

  // 6. Weekly spending digest (Sunday / Monday only)
  const isWeekendDigestDay = now.getDay() === 0 || now.getDay() === 1;
  if (prefs.weeklySummary !== false && isWeekendDigestDay) {
    const weekStart = getWeekStart(now);
    const weekTxns = filterTransactionsForWeek(transactions, weekStart);
    const weekExpenses = weekTxns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const weekIncome = weekTxns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const topCat = getTopCategory(weekTxns);

    if (weekExpenses > 0 || weekIncome > 0) {
      alerts.push({
        id: `weekly-summary-${weekStart}`,
        type: "weekly-summary",
        title: "Weekly spending summary",
        message: `This week: ${formatInr(weekExpenses)} spent, ${formatInr(weekIncome)} income.${topCat ? ` Top category: ${topCat.name} (${formatInr(topCat.amount)}).` : ""}`,
        severity: "low",
        createdAt: now.toISOString(),
      });
    }
  }

  // 7. Salary credited
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
        severity: "low",
        createdAt: salaryTxn.transactionDate,
      });
    }
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = alerts.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Rate limit: max 5 high-importance notifications at any time
  return sorted.slice(0, 5);
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