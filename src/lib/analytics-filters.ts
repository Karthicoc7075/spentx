import { isSpendingExpense } from "@/lib/investments";
import { categoryGroups } from "@/lib/analytics-filter-config";
import { getPurposeLabel, transactionMatchesPurpose } from "@/lib/purposes";
import type {
  AnalyticsFilters,
  AnalyticsSortBy,
  Outing,
  OutingExpense,
  OutingFilterType,
  OutingWithWhomFilter,
  Purpose,
  Transaction,
  TransactionStatus,
} from "@/types";

export type TransactionOutingMeta = {
  outingId: string;
  outingName: string;
  outingType: OutingFilterType;
  withWhom: OutingWithWhomFilter;
  outingStatus: Outing["status"];
};

export type AnalyticsFilterContext = {
  outings?: Outing[];
  outingExpenses?: OutingExpense[];
  purposes?: Purpose[];
};

export type ActiveFilterChip = {
  key: string;
  label: string;
};

export type AnalyticsFilterSummary = {
  transactionCount: number;
  totalIncome: number;
  totalExpense: number;
  categoryCount: number;
  accountCount: number;
  outingCount: number;
  tagCount: number;
};

function normalizeStatus(status?: TransactionStatus): TransactionStatus {
  return status ?? "completed";
}

export function inferOutingType(name: string): OutingFilterType {
  const value = name.toLowerCase();
  if (value.includes("movie")) return "movies";
  if (value.includes("dinner") || value.includes("lunch")) return "dinner";
  if (value.includes("temple")) return "temple";
  if (value.includes("vacation") || value.includes("holiday")) return "vacation";
  if (value.includes("shop")) return "shopping";
  if (
    value.includes("trip") ||
    value.includes("outing") ||
    value.includes("travel")
  ) {
    return "trip";
  }
  return "other";
}

export function inferWithWhom(outing: Outing): OutingWithWhomFilter {
  const others = outing.members.filter((member) => !member.isCurrentUser);
  if (outing.members.length <= 1 || others.length === 0) return "alone";
  if (outing.members.length <= 3) return "friends";
  if (outing.members.length <= 5) return "family";
  return "colleagues";
}

export function buildTransactionOutingIndex(
  outings: Outing[] = [],
  outingExpenses: OutingExpense[] = [],
) {
  const outingById = new Map(outings.map((outing) => [outing.id, outing]));
  const index = new Map<string, TransactionOutingMeta>();

  for (const expense of outingExpenses) {
    if (!expense.linkedTransactionId) continue;
    const outing = outingById.get(expense.outingId);
    if (!outing) continue;

    index.set(expense.linkedTransactionId, {
      outingId: outing.id,
      outingName: outing.name,
      outingType: inferOutingType(outing.name),
      withWhom: inferWithWhom(outing),
      outingStatus: outing.status,
    });
  }

  return index;
}

export function getCategoriesForGroup(group: string) {
  return categoryGroups[group] ?? [];
}

export function getTopMerchants(
  transactions: Transaction[],
  limit = 20,
) {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    totals.set(
      transaction.merchant,
      (totals.get(transaction.merchant) ?? 0) + transaction.amount,
    );
  }

  return [...totals.entries()]
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function extractTransactionTags(transactions: Transaction[]) {
  const tags = new Set<string>();
  for (const transaction of transactions) {
    for (const tag of transaction.tags ?? []) {
      if (tag.trim()) tags.add(tag.trim());
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function matchesOutingFilters(
  transaction: Transaction,
  filters: AnalyticsFilters,
  outingIndex: Map<string, TransactionOutingMeta>,
) {
  const hasOutingFilter =
    Boolean(filters.outingType) ||
    Boolean(filters.outingWithWhom) ||
    Boolean(filters.outingStatus);

  if (!hasOutingFilter) return true;

  const meta = outingIndex.get(transaction.id);
  if (!meta) return false;

  if (filters.outingType && meta.outingType !== filters.outingType) return false;
  if (filters.outingWithWhom && meta.withWhom !== filters.outingWithWhom) {
    return false;
  }
  if (filters.outingStatus && meta.outingStatus !== filters.outingStatus) {
    return false;
  }

  return true;
}

function matchesCategoryFilters(transaction: Transaction, filters: AnalyticsFilters) {
  const selectedCategories = new Set(filters.categories);
  const groupCategories = filters.categoryGroup
    ? getCategoriesForGroup(filters.categoryGroup)
    : [];

  if (groupCategories.length > 0) {
    if (selectedCategories.size > 0) {
      return (
        selectedCategories.has(transaction.category) &&
        groupCategories.includes(transaction.category)
      );
    }
    return groupCategories.includes(transaction.category);
  }

  if (selectedCategories.size > 0) {
    return selectedCategories.has(transaction.category);
  }

  return true;
}

export function applyAnalyticsFilters(
  transactions: Transaction[],
  filters: AnalyticsFilters,
  context: AnalyticsFilterContext = {},
) {
  const search = filters.search.trim().toLowerCase();
  const outingIndex = buildTransactionOutingIndex(
    context.outings,
    context.outingExpenses,
  );

  return transactions.filter((transaction) => {
    const date = new Date(transaction.date).getTime();
    const from = filters.dateFrom
      ? new Date(filters.dateFrom).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = filters.dateTo
      ? new Date(`${filters.dateTo}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;
    const amount = Math.abs(transaction.amount);
    const status = normalizeStatus(transaction.status);

    return (
      date >= from &&
      date <= to &&
      matchesCategoryFilters(transaction, filters) &&
      (!filters.account || transaction.account === filters.account) &&
      (!filters.source || transaction.source === filters.source) &&
      (!filters.purposeId ||
        transactionMatchesPurpose(
          transaction.purpose,
          filters.purposeId,
          context.purposes ?? [],
        )) &&
      (!filters.contributorSource ||
        transaction.contributorSource === filters.contributorSource) &&
      (!filters.merchant || transaction.merchant === filters.merchant) &&
      (!filters.transactionStatus || status === filters.transactionStatus) &&
      (!filters.minAmount || amount >= Number(filters.minAmount)) &&
      (!filters.maxAmount || amount <= Number(filters.maxAmount)) &&
      (!filters.transactionType ||
        transaction.type === filters.transactionType) &&
      (!filters.tags.length ||
        (transaction.tags ?? []).some((tag) => filters.tags.includes(tag))) &&
      matchesOutingFilters(transaction, filters, outingIndex) &&
      (!search ||
        [
          transaction.merchant,
          transaction.category,
          transaction.account,
          transaction.purpose,
          transaction.note,
          ...(transaction.tags ?? []),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search)))
    );
  });
}

export function sortAnalyticsTransactions(
  transactions: Transaction[],
  sortBy: AnalyticsSortBy = "newest",
) {
  return [...transactions].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    if (sortBy === "amount-high") return b.amount - a.amount;
    if (sortBy === "amount-low") return a.amount - b.amount;
    if (sortBy === "merchant-az") {
      return a.merchant.localeCompare(b.merchant);
    }
    return a.category.localeCompare(b.category);
  });
}

export function countAdvancedFilters(filters: AnalyticsFilters) {
  let count = 0;
  if (filters.transactionType) count += 1;
  if (filters.source) count += 1;
  if (filters.transactionStatus) count += 1;
  if (filters.minAmount) count += 1;
  if (filters.maxAmount) count += 1;
  if (filters.categoryGroup) count += 1;
  if (filters.tags.length) count += 1;
  if (filters.outingType) count += 1;
  if (filters.outingWithWhom) count += 1;
  if (filters.outingStatus) count += 1;
  if (filters.compareMode) count += 1;
  if (filters.sortBy !== "newest") count += 1;
  return count;
}

export function countActiveFilters(filters: AnalyticsFilters) {
  let count = 0;
  if (filters.datePreset !== "this-month") count += 1;
  if (filters.account) count += 1;
  if (filters.purposeId) count += 1;
  if (filters.source) count += 1;
  if (filters.merchant) count += 1;
  if (filters.transactionStatus) count += 1;
  if (filters.search) count += 1;
  if (filters.minAmount) count += 1;
  if (filters.maxAmount) count += 1;
  if (filters.transactionType) count += 1;
  if (filters.categories.length) count += 1;
  if (filters.categoryGroup) count += 1;
  if (filters.tags.length) count += 1;
  if (filters.outingType) count += 1;
  if (filters.outingWithWhom) count += 1;
  if (filters.outingStatus) count += 1;
  if (filters.compareMode) count += 1;
  if (filters.sortBy !== "newest") count += 1;
  return count;
}

export function buildActiveFilterChips(
  filters: AnalyticsFilters,
  purposes: Purpose[] = [],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.datePreset !== "custom") {
    const presetLabels: Record<AnalyticsFilters["datePreset"], string> = {
      "this-month": "This month",
      "last-month": "Last month",
      "last-3-months": "Last 3 months",
      "this-year": "This year",
      custom: "Custom range",
    };
    chips.push({
      key: "datePreset",
      label: presetLabels[filters.datePreset],
    });
  } else if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: "dateRange",
      label: `${filters.dateFrom} → ${filters.dateTo}`,
    });
  }

  if (filters.transactionType) {
    chips.push({
      key: "transactionType",
      label: filters.transactionType === "income" ? "Income" : "Expense",
    });
  }
  if (filters.account) chips.push({ key: "account", label: filters.account });
  if (filters.purposeId) {
    chips.push({
      key: "purpose",
      label:
        filters.purpose ||
        getPurposeLabel(filters.purposeId, purposes) ||
        filters.purposeId,
    });
  }
  if (filters.source) chips.push({ key: "source", label: filters.source });
  if (filters.merchant) chips.push({ key: "merchant", label: filters.merchant });
  if (filters.transactionStatus) {
    chips.push({
      key: "transactionStatus",
      label: filters.transactionStatus,
    });
  }
  if (filters.categoryGroup) {
    chips.push({ key: "categoryGroup", label: filters.categoryGroup });
  }
  for (const category of filters.categories) {
    chips.push({ key: `category:${category}`, label: category });
  }
  for (const tag of filters.tags) {
    chips.push({ key: `tag:${tag}`, label: tag });
  }
  if (filters.minAmount) {
    chips.push({ key: "minAmount", label: `₹${filters.minAmount}+` });
  }
  if (filters.maxAmount) {
    chips.push({ key: "maxAmount", label: `≤ ₹${filters.maxAmount}` });
  }
  if (filters.search) chips.push({ key: "search", label: `"${filters.search}"` });
  if (filters.outingType) {
    chips.push({ key: "outingType", label: filters.outingType });
  }
  if (filters.outingWithWhom) {
    chips.push({ key: "outingWithWhom", label: filters.outingWithWhom });
  }
  if (filters.outingStatus) {
    chips.push({ key: "outingStatus", label: filters.outingStatus });
  }
  if (filters.compareMode) {
    const compareLabels: Record<AnalyticsFilters["compareMode"], string> = {
      "": "",
      "previous-month": "Compare Previous Month",
      "avg-3-months": "Average of Last 3 Months",
      "avg-6-months": "Average of Last 6 Months",
    };
    chips.push({
      key: "compareMode",
      label: compareLabels[filters.compareMode],
    });
  }

  return chips;
}

export function computeAnalyticsFilterSummary(
  transactions: Transaction[],
  context: AnalyticsFilterContext = {},
): AnalyticsFilterSummary {
  const outingIndex = buildTransactionOutingIndex(
    context.outings,
    context.outingExpenses,
  );
  const outingIds = new Set<string>();

  for (const transaction of transactions) {
    const meta = outingIndex.get(transaction.id);
    if (meta) outingIds.add(meta.outingId);
  }

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpense = transactions
    .filter(isSpendingExpense)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    transactionCount: transactions.length,
    totalIncome,
    totalExpense,
    categoryCount: new Set(transactions.map((transaction) => transaction.category))
      .size,
    accountCount: new Set(transactions.map((transaction) => transaction.account))
      .size,
    outingCount: outingIds.size,
    tagCount: new Set(
      transactions.flatMap((transaction) => transaction.tags ?? []),
    ).size,
  };
}

export function clearFilterChip(
  filters: AnalyticsFilters,
  chipKey: string,
): AnalyticsFilters {
  if (chipKey === "datePreset" || chipKey === "dateRange") {
    return filters;
  }
  if (chipKey === "transactionType") return { ...filters, transactionType: "" };
  if (chipKey === "account") return { ...filters, account: "" };
  if (chipKey === "purpose") {
    return { ...filters, purpose: "", purposeId: "" };
  }
  if (chipKey === "source") return { ...filters, source: "" };
  if (chipKey === "merchant") return { ...filters, merchant: "" };
  if (chipKey === "transactionStatus") {
    return { ...filters, transactionStatus: "" };
  }
  if (chipKey === "categoryGroup") return { ...filters, categoryGroup: "" };
  if (chipKey.startsWith("category:")) {
    const category = chipKey.replace("category:", "");
    return {
      ...filters,
      categories: filters.categories.filter((item) => item !== category),
    };
  }
  if (chipKey.startsWith("tag:")) {
    const tag = chipKey.replace("tag:", "");
    return {
      ...filters,
      tags: filters.tags.filter((item) => item !== tag),
    };
  }
  if (chipKey === "minAmount") return { ...filters, minAmount: "" };
  if (chipKey === "maxAmount") return { ...filters, maxAmount: "" };
  if (chipKey === "search") return { ...filters, search: "" };
  if (chipKey === "outingType") return { ...filters, outingType: "" };
  if (chipKey === "outingWithWhom") return { ...filters, outingWithWhom: "" };
  if (chipKey === "outingStatus") return { ...filters, outingStatus: "" };
  if (chipKey === "compareMode") {
    return { ...filters, compareMode: "" };
  }
  return filters;
}