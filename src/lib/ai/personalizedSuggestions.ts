import {
  filterTransactionsForWeek,
  getWeekStart,
} from "@/lib/journal";
import { sumPlanned } from "@/lib/plan";
import type {
  MonthlyPlan,
  PersonalizedSuggestion,
  Reflection,
  Transaction,
} from "@/types";

const LATE_NIGHT_MERCHANTS = ["swiggy", "zomato", "uber eats", "dunzo"];
const FOOD_CATEGORIES = ["Food", "Dining", "Groceries"];

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function getMonthExpenses(transactions: Transaction[], monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + monthOffset + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return transactions.filter((transaction) => {
    if (transaction.type !== "expense") return false;
    const date = new Date(transaction.date);
    return date >= start && date <= end;
  });
}

function sumByCategory(transactions: Transaction[]) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    totals.set(
      transaction.category,
      (totals.get(transaction.category) ?? 0) + transaction.amount,
    );
  }
  return totals;
}

function getWeekendSpend(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "expense") return false;
      const day = new Date(transaction.date).getDay();
      return day === 0 || day === 6;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getLateNightFoodSpend(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "expense") return false;
      const date = new Date(transaction.date);
      const hour = date.getHours();
      const merchant = transaction.merchant.toLowerCase();
      const isLateNight = hour >= 21 || hour < 2;
      const isDelivery =
        LATE_NIGHT_MERCHANTS.some((name) => merchant.includes(name)) ||
        FOOD_CATEGORIES.includes(transaction.category);
      return isLateNight && isDelivery;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getHomeCookingSavings(transactions: Transaction[]) {
  const thisMonth = getMonthExpenses(transactions, 0);
  const lastMonth = getMonthExpenses(transactions, -1);
  const thisGroceries = thisMonth
    .filter((transaction) => transaction.category === "Groceries")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const lastDining = lastMonth
    .filter((transaction) =>
      ["Dining", "Food"].includes(transaction.category),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const thisDining = thisMonth
    .filter((transaction) =>
      ["Dining", "Food"].includes(transaction.category),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  if (lastDining > thisDining && thisGroceries > 0) {
    return lastDining - thisDining;
  }
  return 0;
}

export function buildPersonalizedSuggestions({
  transactions,
  reflections = [],
  monthlyPlan,
  limit = 4,
}: {
  transactions: Transaction[];
  reflections?: Reflection[];
  monthlyPlan?: MonthlyPlan | null;
  limit?: number;
}): PersonalizedSuggestion[] {
  const suggestions: PersonalizedSuggestion[] = [];
  const currentWeek = getWeekStart();
  const weekTransactions = filterTransactionsForWeek(transactions, currentWeek);
  const thisMonth = getMonthExpenses(transactions, 0);
  const lastMonth = getMonthExpenses(transactions, -1);

  const homeCookingSavings = getHomeCookingSavings(transactions);
  if (homeCookingSavings >= 500) {
    suggestions.push({
      id: "home-cooking",
      title: "Repeat a winning habit",
      message: `Last month you saved ${formatInr(homeCookingSavings)} by cooking at home more. Repeating that habit this month could save another ${formatInr(Math.round(homeCookingSavings * 0.85))}.`,
      tone: "success",
      category: "Food",
    });
  }

  const lateNightSpend = getLateNightFoodSpend(thisMonth);
  if (lateNightSpend >= 300) {
    suggestions.push({
      id: "late-night-food",
      title: "Late-night delivery pattern",
      message: `You tend to overspend on food delivery after 9 PM (${formatInr(lateNightSpend)} this month). Consider setting a small late-night food limit of ${formatInr(Math.min(500, Math.round(lateNightSpend / 2)))}/week.`,
      tone: "warning",
      category: "Food",
    });
  }

  const weekendSpend = getWeekendSpend(thisMonth);
  const weekdaySpend = thisMonth.reduce((sum, transaction) => sum + transaction.amount, 0) - weekendSpend;
  if (weekendSpend > weekdaySpend * 0.6 && weekendSpend > 2000) {
    suggestions.push({
      id: "weekend-overspend",
      title: "Weekend spending spike",
      message: `Weekend spending (${formatInr(weekendSpend)}) is outpacing weekdays. Planning Sunday meals in advance helped you stay on track in past weeks.`,
      tone: "warning",
    });
  }

  if (monthlyPlan) {
    const plannedTotal = sumPlanned(monthlyPlan.allocations);
    const monthSpend = thisMonth.reduce((sum, transaction) => sum + transaction.amount, 0);
    const topAllocation = [...monthlyPlan.allocations].sort(
      (a, b) => b.plannedAmount - a.plannedAmount,
    )[0];

    if (topAllocation && monthSpend > plannedTotal * 0.85) {
      suggestions.push({
        id: "plan-pressure",
        title: "Plan check-in",
        message: `You've used ${Math.round((monthSpend / plannedTotal) * 100)}% of your monthly plan. Trim ${topAllocation.category} by ${formatInr(Math.round(topAllocation.plannedAmount * 0.1))} to finish the month comfortably.`,
        tone: "info",
        category: topAllocation.category,
      });
    }
  }

  const thisTotals = sumByCategory(thisMonth);
  const lastTotals = sumByCategory(lastMonth);
  for (const [category, amount] of thisTotals.entries()) {
    const previous = lastTotals.get(category) ?? 0;
    if (previous > 0 && amount > previous * 1.25 && amount - previous >= 1000) {
      suggestions.push({
        id: `category-rise-${category}`,
        title: `${category} is trending up`,
        message: `${category} spending rose from ${formatInr(previous)} last month to ${formatInr(amount)}. A small weekly cap could bring it back in line.`,
        tone: "warning",
        category,
      });
      break;
    }
  }

  const recentReflection = reflections[0];
  if (recentReflection?.unnecessarySpend.trim()) {
    suggestions.push({
      id: "reflection-followup",
      title: "From your last reflection",
      message: `You flagged unnecessary spending last week. Keeping ${recentReflection.differentNextWeek.trim() || "your planned change"} visible on the dashboard could help you follow through.`,
      tone: "info",
    });
  }

  if (weekTransactions.length === 0 && suggestions.length === 0) {
    suggestions.push({
      id: "getting-started",
      title: "Build your insight profile",
      message:
        "Add a few transactions and write your first weekly reflection to unlock personalized coaching.",
      tone: "info",
    });
  }

  return suggestions.slice(0, limit);
}

export function getTransactionTip(
  category: string,
  merchant: string,
  transactions: Transaction[],
): PersonalizedSuggestion | null {
  if (!category) return null;

  const merchantLower = merchant.toLowerCase();
  const lateNightMerchants = LATE_NIGHT_MERCHANTS.some((name) =>
    merchantLower.includes(name),
  );

  if (
    (FOOD_CATEGORIES.includes(category) || lateNightMerchants) &&
    getLateNightFoodSpend(transactions) > 0
  ) {
    return {
      id: "txn-late-night",
      title: "Quick tip",
      message:
        "Late-night food orders have been a pattern for you. Consider a weekly cap to stay intentional.",
      tone: "warning",
      category: "Food",
    };
  }

  if (category === "Shopping") {
    const shoppingThisMonth = getMonthExpenses(transactions, 0)
      .filter((transaction) => transaction.category === "Shopping")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    if (shoppingThisMonth > 3000) {
      return {
        id: "txn-shopping",
        title: "Quick tip",
        message: `Shopping is already at ${formatInr(shoppingThisMonth)} this month. Pause for a day before adding another discretionary purchase.`,
        tone: "info",
        category: "Shopping",
      };
    }
  }

  return null;
}