import type { Outing, OutingExpense, OutingSettlement } from "@/types";
import {
  computeMemberBalances,
  computeTripSummary,
  getCurrentUserMember,
} from "@/lib/outings";

export type OutingListFilter = "all" | "active" | "completed" | "planned";

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

export function isOutingPlanned(outing: Outing) {
  if (outing.status !== "active") return false;
  const start = new Date(outing.startDate);
  if (Number.isNaN(start.getTime())) return false;
  return start > new Date();
}

export function getOutingStatusLabel(outing: Outing) {
  if (isOutingPlanned(outing)) return "Planned";
  if (outing.status === "active") return "Active";
  if (outing.status === "completed") return "Completed";
  return "Cancelled";
}

export function filterOutings(
  outings: Outing[],
  filter: OutingListFilter,
  searchQuery: string,
) {
  const query = searchQuery.trim().toLowerCase();

  return outings.filter((outing) => {
    if (filter === "active" && (outing.status !== "active" || isOutingPlanned(outing))) {
      return false;
    }
    if (filter === "completed" && outing.status !== "completed") return false;
    if (filter === "planned" && !isOutingPlanned(outing)) return false;
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