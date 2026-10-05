import type { Outing, OutingExpense, OutingSettlement } from "@/types";
import {
  computeMemberBalances,
  computeTripSummary,
  getCurrentUserMember,
} from "@/lib/outings";

export type OutingListFilter = "all" | "active" | "completed" | "archived" | "planned";

const CATEGORY_COLOR_MAP: Record<string, string> = {
  Trip: "oklch(0.52 0.17 156)",
  Temple: "oklch(0.55 0.2 300)",
  Restaurant: "oklch(0.62 0.2 45)",
  Movies: "oklch(0.58 0.18 320)",
  Food: "oklch(0.58 0.22 15)",
  Other: "oklch(0.46 0.03 252)",
};

export function getCategoryColor(category?: string) {
  const key = category?.trim() || "Trip";
  if (CATEGORY_COLOR_MAP[key]) return CATEGORY_COLOR_MAP[key];

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.55 0.16 ${hue})`;
}

function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatOutingDates(outing: Outing) {
  if (outing.startDate && outing.endDate) {
    const start = formatShortDate(outing.startDate);
    const end = formatShortDate(outing.endDate);
    return start === end ? start : `${start} – ${end}`;
  }
  if (outing.startDate) return formatShortDate(outing.startDate);
  return "";
}

export function getLocalTodayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOutingPlanned(outing: Outing, todayStr?: string) {
  if (outing.isActive === false || Boolean(outing.deletedAt)) return false;
  if (outing.status !== "active") return false;
  if (!outing.startDate) return false;
  const today = todayStr || getLocalTodayDateStr();
  const start = outing.startDate.slice(0, 10);
  return today < start;
}

export function isOutingActive(outing: Outing, todayStr?: string) {
  if (outing.isActive === false || Boolean(outing.deletedAt)) return false;
  if (outing.status !== "active") return false;
  if (!outing.startDate) return true;
  const today = todayStr || getLocalTodayDateStr();
  const start = outing.startDate.slice(0, 10);
  const end = outing.endDate ? outing.endDate.slice(0, 10) : start;
  return today >= start && today <= end;
}

export function isOutingCompleted(outing: Outing, todayStr?: string) {
  if (outing.status === "completed") return true;
  if (outing.status !== "active") return false;
  if (!outing.startDate) return false;
  const today = todayStr || getLocalTodayDateStr();
  const start = outing.startDate.slice(0, 10);
  const end = outing.endDate ? outing.endDate.slice(0, 10) : start;
  return today > end;
}

export function getOutingStatusLabel(outing: Outing, todayStr?: string) {
  const today = todayStr || getLocalTodayDateStr();
  if (outing.status === "archived") return "Archived";
  if (outing.status === "cancelled") return "Cancelled";
  if (isOutingPlanned(outing, today)) return "Planned";
  if (isOutingCompleted(outing, today)) return "Completed";
  if (isOutingActive(outing, today)) return "Active";
  return "Active";
}

export function filterOutings(
  outings: Outing[],
  filter: OutingListFilter,
  searchQuery: string,
) {
  const today = getLocalTodayDateStr();
  const query = searchQuery.trim().toLowerCase();

  return outings.filter((outing) => {
    // Hidden trips auto-created for a "Friend split" on a normal transaction
    // — never shown in the regular Outings list.
    if (outing.isQuickSplit) return false;
    const isPlanned = isOutingPlanned(outing, today);
    const isCompleted = isOutingCompleted(outing, today);
    const isActive = isOutingActive(outing, today);

    if (filter === "active" && !isActive) return false;
    if (filter === "completed" && !isCompleted) return false;
    if (filter === "archived" && outing.status !== "archived") return false;
    if (filter === "planned" && !isPlanned) return false;
    if (!query) return true;

    return (
      outing.name.toLowerCase().includes(query) ||
      (outing.location?.toLowerCase().includes(query) ?? false) ||
      (outing.category?.toLowerCase().includes(query) ?? false)
    );
  });
}

export function sortOutings(
  outings: Outing[],
  getTotalSpent: (outingId: string) => number,
) {
  return [...outings].sort((a, b) => {
    const aDate = new Date(a.createdAt ?? a.startDate).getTime();
    const bDate = new Date(b.createdAt ?? b.startDate).getTime();
    return bDate - aDate;
  });
}

export function getOutingCardStats(
  outing: Outing,
  expenses: OutingExpense[],
  settlements: OutingSettlement[] = [],
) {
  const summary = computeTripSummary(outing, expenses, settlements);
  const currentMember = getCurrentUserMember(outing.members);
  const balances = computeMemberBalances(outing.members, expenses, settlements);
  const netBalance =
    balances.find((item) => item.member.id === currentMember?.id)?.balance ?? 0;

  return {
    totalSpent: summary.totalSpent,
    yourShare: summary.yourShare,
    netBalance,
    expenseCount: expenses.length,
  };
}

export function formatBalancePill(netBalance: number, userName = "You") {
  if (Math.abs(netBalance) < 0.01) return "All settled";
  if (netBalance > 0) return `${userName} are owed`;
  return `${userName} owe`;
}