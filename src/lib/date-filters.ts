import { getMonthDateRange } from "@/lib/dashboard";
import type { DashboardDatePreset } from "@/types";

export function getDateRangeForDashboardPreset(
  preset: DashboardDatePreset,
  specificMonth = "",
) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);

  if (preset === "last-7-days") {
    start.setDate(end.getDate() - 6);
  } else if (preset === "this-month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === "last-month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setDate(0);
  } else if (preset === "specific-month" && specificMonth) {
    const range = getMonthDateRange(specificMonth);
    return range;
  } else if (preset === "last-3-months") {
    start.setDate(end.getDate() - 89);
  } else if (preset === "last-6-months") {
    start.setDate(end.getDate() - 179);
  } else if (preset === "last-12-months") {
    start.setDate(end.getDate() - 364);
  }

  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
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