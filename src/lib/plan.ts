import { defaultCategories } from "@/lib/mock-data";
import type {
  Category,
  PlanAllocation,
  PlanBudgetStatus,
  PlanSuggestion,
  Transaction,
} from "@/types";

export function formatPlanMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function formatBudgetSetDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function getCurrentPlanMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function getPlanMonthOptions(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const value = `${date.getFullYear()}-${month}`;
    return {
      value,
      label: formatPlanMonth(value),
    };
  });
}

export function shiftPlanMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}`;
}

export function formatPlanMonthShort(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export function getDefaultPlanAllocations(
  categories: Category[] = defaultCategories,
): PlanAllocation[] {
  return categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      id: category.id,
      category: category.name,
      plannedAmount: 0,
      color: category.color,
    }));
}

export function createEmptyPlan(
  month: string,
  categories: Category[] = defaultCategories,
): Omit<MonthlyPlanShape, "id"> {
  return {
    month,
    expectedIncome: 0,
    allocations: getDefaultPlanAllocations(categories),
  };
}

type MonthlyPlanShape = {
  month: string;
  expectedIncome: number;
  allocations: PlanAllocation[];
};

export const WEALTH_CATEGORY_COLORS = {
  investment: "#818cf8",
  savings: "#10b981",
} as const;

const WEALTH_BUFFER_WEIGHT = 0.35;

export function getPlanCategoryKind(
  category: string,
): "investment" | "savings" | "spending" {
  const lower = category.toLowerCase();
  if (lower.includes("investment")) return "investment";
  if (lower.includes("savings")) return "savings";
  return "spending";
}

export function isWealthCategory(category: string) {
  const kind = getPlanCategoryKind(category);
  return kind === "investment" || kind === "savings";
}

export function getPieChartColor(category: string, fallback: string) {
  const kind = getPlanCategoryKind(category);
  if (kind === "investment") return WEALTH_CATEGORY_COLORS.investment;
  if (kind === "savings") return WEALTH_CATEGORY_COLORS.savings;
  return fallback;
}

export function sumPlanned(allocations: PlanAllocation[]) {
  return allocations.reduce((sum, item) => sum + item.plannedAmount, 0);
}

export function sumPlannedForBuffer(allocations: PlanAllocation[]) {
  return allocations.reduce((sum, item) => {
    if (isWealthCategory(item.category)) {
      return sum + item.plannedAmount * WEALTH_BUFFER_WEIGHT;
    }
    return sum + item.plannedAmount;
  }, 0);
}

export function getAllocationPercent(amount: number, expectedIncome: number) {
  if (expectedIncome <= 0) return 0;
  return Math.round((amount / expectedIncome) * 100);
}

/**
 * Spec A3.3 — Rollover Budget. Unused budget from a category (in the
 * previous month) carries forward as extra headroom this month, but only
 * for categories with rollover enabled. It only ever adds — overspending
 * never carries forward as a negative adjustment.
 */
export type RolloverBreakdown = {
  base: number;
  rolledOver: number;
  effective: number;
};

export function computeEffectiveBudget(
  allocation: PlanAllocation,
  previousAllocations: PlanAllocation[] | null,
  previousActual: number,
): RolloverBreakdown {
  const base = allocation.plannedAmount;

  if (!allocation.rollover || !previousAllocations) {
    return { base, rolledOver: 0, effective: base };
  }

  const previous = previousAllocations.find(
    (item) => item.category === allocation.category,
  );

  if (!previous) return { base, rolledOver: 0, effective: base };

  const rolledOver = Math.max(0, previous.plannedAmount - previousActual);
  return { base, rolledOver, effective: base + rolledOver };
}

export function getPlanBudgetStatus(
  totalPlanned: number,
  expectedIncome: number,
): PlanBudgetStatus {
  if (expectedIncome <= 0) return totalPlanned > 0 ? "over" : "within";

  const ratio = totalPlanned / expectedIncome;
  if (ratio <= 1) return "within";
  if (ratio <= 1.08) return "slight-over";
  return "over";
}

export function getPlanDelta(totalPlanned: number, expectedIncome: number) {
  return expectedIncome - totalPlanned;
}

export function getUtilization(totalPlanned: number, expectedIncome: number) {
  if (expectedIncome <= 0) return 0;
  return Math.min(150, Math.round((totalPlanned / expectedIncome) * 100));
}

export function suggestExpectedIncome(transactions: Transaction[]) {
  const salaryTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "income" &&
      ["Salary", "Freelance"].includes(transaction.category),
  );

  if (!salaryTransactions.length) return 0;

  const recent = salaryTransactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  const average =
    recent.reduce((sum, transaction) => sum + transaction.amount, 0) /
    recent.length;

  return Math.round(average);
}

export function buildPlanSuggestions(
  allocations: PlanAllocation[],
  shortfall: number,
): PlanSuggestion[] {
  if (shortfall <= 0) return [];

  const reducible = [...allocations]
    .filter((item) => item.plannedAmount > 0)
    .sort((a, b) => b.plannedAmount - a.plannedAmount);

  let remaining = shortfall;
  const suggestions: PlanSuggestion[] = [];

  for (const item of reducible) {
    if (remaining <= 0) break;

    const maxReduction = Math.max(0, item.plannedAmount - 500);
    const reduction = Math.min(remaining, Math.max(500, Math.round(maxReduction * 0.35)));

    if (reduction <= 0) continue;

    const suggestedAmount = Math.max(0, item.plannedAmount - reduction);
    suggestions.push({
      category: item.category,
      currentAmount: item.plannedAmount,
      suggestedAmount,
      savings: item.plannedAmount - suggestedAmount,
    });
    remaining -= item.plannedAmount - suggestedAmount;
  }

  return suggestions;
}

export function applyPlanSuggestions(
  allocations: PlanAllocation[],
  suggestions: PlanSuggestion[],
) {
  return allocations.map((allocation) => {
    const suggestion = suggestions.find(
      (item) => item.category === allocation.category,
    );
    if (!suggestion) return allocation;

    return {
      ...allocation,
      plannedAmount: suggestion.suggestedAmount,
    };
  });
}

export function getPieChartData(allocations: PlanAllocation[]) {
  return allocations
    .filter((item) => item.plannedAmount > 0)
    .map((item) => ({
      name: item.category,
      value: item.plannedAmount,
      color: getPieChartColor(item.category, item.color),
    }));
}

export function applyActualsToBudget(
  allocations: PlanAllocation[],
  expectedIncome: number,
  categorySpentMap: Record<string, number>,
) {
  const income = Math.max(0, Math.round(expectedIncome));

  let nextAllocations = allocations.map((allocation) => ({
    ...allocation,
    plannedAmount: Math.round(categorySpentMap[allocation.category] || 0),
  }));

  const totalPlanned = sumPlanned(nextAllocations);

  if (income <= 0) {
    return {
      allocations: nextAllocations.map((allocation) => ({
        ...allocation,
        plannedAmount: 0,
      })),
      expectedIncome: 0,
      scaled: totalPlanned > 0,
    };
  }

  if (totalPlanned <= income) {
    return {
      allocations: nextAllocations,
      expectedIncome: income,
      scaled: false,
    };
  }

  const factor = income / totalPlanned;
  nextAllocations = nextAllocations.map((allocation) => ({
    ...allocation,
    plannedAmount: Math.round(allocation.plannedAmount * factor),
  }));

  let scaledTotal = sumPlanned(nextAllocations);
  const drift = scaledTotal - income;

  if (drift !== 0) {
    const largest = [...nextAllocations].sort(
      (a, b) => b.plannedAmount - a.plannedAmount,
    )[0];

    if (largest) {
      nextAllocations = nextAllocations.map((allocation) =>
        allocation.id === largest.id
          ? {
              ...allocation,
              plannedAmount: Math.max(0, allocation.plannedAmount - drift),
            }
          : allocation,
      );
      scaledTotal = sumPlanned(nextAllocations);
    }
  }

  return {
    allocations: nextAllocations,
    expectedIncome: income,
    scaled: true,
    overflowAmount: totalPlanned - income,
    finalTotal: scaledTotal,
  };
}

export function autoBalanceAllocations(
  allocations: PlanAllocation[],
  expectedIncome: number,
): PlanAllocation[] {
  if (expectedIncome <= 0 || allocations.length === 0) return allocations;

  const currentTotal = sumPlanned(allocations);
  const delta = expectedIncome - currentTotal;

  if (Math.abs(delta) < 1) return allocations;

  if (delta < 0) {
    const factor = expectedIncome / currentTotal;
    return allocations.map((allocation) => {
      const scaled = allocation.plannedAmount * factor;
      if (isWealthCategory(allocation.category)) {
        const softened =
          allocation.plannedAmount -
          (allocation.plannedAmount - scaled) * 0.5;
        return {
          ...allocation,
          plannedAmount: Math.round(Math.max(0, softened)),
        };
      }
      return {
        ...allocation,
        plannedAmount: Math.round(Math.max(0, scaled)),
      };
    });
  }

  const flexible = allocations.filter(
    (allocation) => !isWealthCategory(allocation.category),
  );
  const targets = flexible.length > 0 ? flexible : allocations;
  const targetTotal = targets.reduce((sum, item) => sum + item.plannedAmount, 0);

  if (targetTotal <= 0) {
    const perCategory = Math.round(delta / targets.length);
    return allocations.map((allocation) => {
      const isTarget = targets.some((item) => item.id === allocation.id);
      if (!isTarget) return allocation;
      return {
        ...allocation,
        plannedAmount: allocation.plannedAmount + perCategory,
      };
    });
  }

  return allocations.map((allocation) => {
    const isTarget = targets.some((item) => item.id === allocation.id);
    if (!isTarget) return allocation;
    const share = (allocation.plannedAmount / targetTotal) * delta;
    return {
      ...allocation,
      plannedAmount: Math.round(allocation.plannedAmount + share),
    };
  });
}

export function getBudgetVsActualSummary(
  allocations: PlanAllocation[],
  categorySpentActuals: Record<string, number>,
) {
  const totalPlanned = sumPlanned(allocations);
  const totalActual = allocations.reduce(
    (sum, allocation) => sum + (categorySpentActuals[allocation.category] || 0),
    0,
  );

  if (totalPlanned <= 0) {
    return {
      totalPlanned,
      totalActual,
      variancePercent: 0,
      message: "Set category budgets to compare against actual spending.",
    };
  }

  const variancePercent = Math.round(
    ((totalPlanned - totalActual) / totalPlanned) * 100,
  );

  if (variancePercent > 0) {
    return {
      totalPlanned,
      totalActual,
      variancePercent,
      message: `You are currently ${variancePercent}% under your planned budget this month.`,
    };
  }

  if (variancePercent < 0) {
    return {
      totalPlanned,
      totalActual,
      variancePercent,
      message: `You are currently ${Math.abs(variancePercent)}% over your planned budget this month.`,
    };
  }

  return {
    totalPlanned,
    totalActual,
    variancePercent,
    message: "You are exactly on track with your planned budget this month.",
  };
}

export function buildIncomeIdeas(expectedIncome: number, shortfall: number) {
  const target = expectedIncome + shortfall;
  return [
    `Increase expected income to ${formatInr(target)} to cover the current plan.`,
    "Move flexible categories like Shopping or Dining into a lower-priority bucket.",
    "Reuse a previous month template after trimming discretionary spend.",
  ];
}

function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}