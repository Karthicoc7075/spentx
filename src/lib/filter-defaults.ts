import { getMonthDateRange } from "@/lib/dashboard";
import { getCurrentPlanMonth } from "@/lib/plan";
import type { GlobalFilters } from "@/types";

export function createDefaultGlobalFilters(
  overrides: Partial<GlobalFilters> = {},
): GlobalFilters {
  const currentMonth = getCurrentPlanMonth();
  const currentMonthRange = getMonthDateRange(currentMonth);

  return {
    dateFrom: currentMonthRange.dateFrom,
    dateTo: currentMonthRange.dateTo,
    categories: [],
    account: "",
    source: "",
    search: "",
    minAmount: "",
    maxAmount: "",
    transactionType: "",
    dashboardMonth: currentMonth,
    dashboardDatePreset: "this-month",
    purposeId: "",
    contributorSource: "",
    specificMonth: currentMonth,
    ...overrides,
  };
}