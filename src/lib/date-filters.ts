import { getMonthDateRange } from "@/lib/dashboard";
import { getCurrentPlanMonth } from "@/lib/plan";
import type { DashboardDatePreset } from "@/types";

export function getDateRangeForDashboardPreset(
  preset: DashboardDatePreset,
  specificMonth = "",
) {
  const currentMonth = getCurrentPlanMonth();

  if (preset === "this-month") {
    return getMonthDateRange(currentMonth);
  }

  if (preset === "last-month") {
    const [yearStr, monthStr] = currentMonth.split("-");
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const prevDate = new Date(year, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    return getMonthDateRange(prevMonth);
  }

  if (preset === "specific-month" && specificMonth) {
    return getMonthDateRange(specificMonth);
  }

  const [curYearStr, curMonthStr] = currentMonth.split("-");
  const curYear = parseInt(curYearStr, 10);
  const curMonth = parseInt(curMonthStr, 10);
  const currentMonthRange = getMonthDateRange(currentMonth);

  if (preset === "last-3-months") {
    const startDate = new Date(curYear, curMonth - 3, 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;
    return {
      dateFrom: startMonth,
      dateTo: currentMonthRange.dateTo,
    };
  }

  if (preset === "last-6-months") {
    const startDate = new Date(curYear, curMonth - 6, 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;
    return {
      dateFrom: startMonth,
      dateTo: currentMonthRange.dateTo,
    };
  }

  if (preset === "last-12-months") {
    const startDate = new Date(curYear, curMonth - 12, 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;
    return {
      dateFrom: startMonth,
      dateTo: currentMonthRange.dateTo,
    };
  }

  const now = new Date();
  const todayStr = toCalendarDate(now);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);

  if (preset === "last-7-days") {
    start.setDate(end.getDate() - 6);
    return {
      dateFrom: toCalendarDate(start),
      dateTo: todayStr,
    };
  }

  return {
    dateFrom: toCalendarDate(start),
    dateTo: currentMonthRange.dateTo,
  };
}

export function toCalendarDate(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayCalendarDate() {
  return toCalendarDate(new Date());
}

export function isOnOrBeforeCalendarDate(
  transactionDate: string,
  asOfDate: string,
) {
  const calendarDate = toCalendarDate(transactionDate);
  if (!calendarDate || !asOfDate) return false;
  return calendarDate <= asOfDate;
}

export function getDaysInRange(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo) return 1;

  const start = new Date(dateFrom);
  const end = new Date(`${dateTo}T23:59:59`);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  return Math.max(1, diff);
}