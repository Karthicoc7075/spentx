import { isSpendingExpense } from "@/lib/investments";
import { categoryGroups } from "@/lib/analytics-filter-config";
import {
  computeOutingRollupAmount,
  computeOutingUserAccountNames,
  computeOutingUserPaidAmount,
  isOutingRollupTransaction,
  latestOutingExpenseDate,
} from "@/lib/outings";
import { PERSONAL_PURPOSE_ID, getPurposeLabel, transactionMatchesPurpose } from "@/lib/purposes";
import { narrowTransactionsToFilter } from "@/lib/utils";
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
import { OUTING_CATEGORIES } from "@/types";

/** Tag on synthetic Analysis rows that represent one outing's full spend. */
export const OUTING_ANALYTICS_TAG = "outing-analytics";

export type TransactionOutingMeta = {
  outingId: string;
  outingName: string;
  outingType: OutingFilterType;
  /** Display label for Category Breakdown: Trip, Temple, Restaurant… */
  outingCategory: string;
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
  if (value.includes("dinner") || value.includes("lunch") || value.includes("restaurant")) {
    return "dinner";
  }
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

/**
 * Best label for Category Breakdown of outing spend:
 * prefer stored outing.category (Trip / Temple / …), else infer from name.
 */
export function resolveOutingCategoryLabel(
  category?: string | null,
  name?: string | null,
): string {
  const raw = (category ?? "").trim();
  if (raw) {
    const exact = OUTING_CATEGORIES.find(
      (item) => item.toLowerCase() === raw.toLowerCase(),
    );
    if (exact) return exact;
    // Free-text category — title-case first word is still readable.
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  const inferred = inferOutingType(name ?? "");
  switch (inferred) {
    case "temple":
      return "Temple";
    case "movies":
      return "Movies";
    case "dinner":
      return "Restaurant";
    case "trip":
    case "vacation":
      return "Trip";
    default:
      return "Other";
  }
}

export function outingTypeFromCategory(categoryLabel: string): OutingFilterType {
  const value = categoryLabel.toLowerCase();
  if (value === "temple") return "temple";
  if (value === "movies") return "movies";
  if (value === "restaurant") return "dinner";
  if (value === "trip") return "trip";
  return "other";
}

export function inferWithWhom(outing: Outing): OutingWithWhomFilter {
  const others = outing.members.filter((member) => !member.isCurrentUser);
  if (outing.members.length <= 1 || others.length === 0) return "alone";
  if (outing.members.length <= 3) return "friends";
  if (outing.members.length <= 5) return "family";
  return "colleagues";
}

function metaForOuting(outing: Outing): TransactionOutingMeta {
  const outingCategory = resolveOutingCategoryLabel(outing.category, outing.name);
  return {
    outingId: outing.id,
    outingName: outing.name,
    outingCategory,
    outingType: outingTypeFromCategory(outingCategory),
    withWhom: inferWithWhom(outing),
    outingStatus: outing.status,
  };
}

export function buildTransactionOutingIndex(
  outings: Outing[] = [],
  outingExpenses: OutingExpense[] = [],
  transactions: Transaction[] = [],
) {
  const outingById = new Map(outings.map((outing) => [outing.id, outing]));
  const index = new Map<string, TransactionOutingMeta>();

  for (const expense of outingExpenses) {
    if (!expense.linkedTransactionId) continue;
    const outing = outingById.get(expense.outingId);
    if (!outing) continue;
    index.set(expense.linkedTransactionId, metaForOuting(outing));
  }

  // Ledger rows tagged with outing_id (including analytics synthetics / rollups).
  for (const transaction of transactions) {
    if (!transaction.outingId || index.has(transaction.id)) continue;
    const outing = outingById.get(transaction.outingId);
    if (!outing) continue;
    index.set(transaction.id, metaForOuting(outing));
  }

  return index;
}

/**
 * Analysis ledger view:
 *  - normal spends stay as-is
 *  - each outing becomes ONE expense row with LIVE total
 *  - category = outing category (Trip / Temple / …) for Category Breakdown
 *  - merchant = outing name for Top Merchants
 *
 * Hides rollup + individual outing-linked rows so totals aren't missing or
 * double-counted (root cause of empty/wrong outing analytics).
 */
export function prepareAnalyticsTransactions(
  transactions: Transaction[],
  outings: Outing[] = [],
  expenses: OutingExpense[] = [],
  includeOutingExpenses = true,
): Transaction[] {
  const synthetic: Transaction[] = [];
  const summarizedOutingIds = new Set<string>();
  const linkedLedgerIds = new Set<string>();

  for (const expense of expenses) {
    if (expense.linkedTransactionId) {
      linkedLedgerIds.add(expense.linkedTransactionId);
    }
  }

  if (includeOutingExpenses) {
    for (const outing of outings) {
      if (outing.isActive === false) continue;
      const outingExpenses = expenses.filter((e) => e.outingId === outing.id);
      const userPaidAmount = computeOutingUserPaidAmount(
        outing,
        outingExpenses,
        transactions,
        outing.id,
      );
      const totalTripAmount = computeOutingRollupAmount(
        outingExpenses,
        undefined,
        transactions,
        outing.id,
      );
      const amount = userPaidAmount > 0 ? userPaidAmount : totalTripAmount;
      if (amount <= 0) continue;

      summarizedOutingIds.add(outing.id);
      const category = resolveOutingCategoryLabel(outing.category, outing.name);
      const dateRaw =
        latestOutingExpenseDate(outingExpenses) ||
        outing.endDate ||
        outing.startDate ||
        new Date().toISOString();
      const dateIso = dateRaw.includes("T")
        ? dateRaw
        : new Date(`${dateRaw.slice(0, 10)}T12:00:00`).toISOString();

      const accountNames = computeOutingUserAccountNames(
        outing,
        outingExpenses,
        transactions,
        outing.id,
      );
      const accountLabel =
        accountNames.length > 1
          ? "Mixed"
          : accountNames[0] || "Cash";

      const expenseTitles = outingExpenses
        .map((e) => e.description)
        .filter(Boolean);

      synthetic.push({
        id: `outing-analytics:${outing.id}`,
        type: "expense",
        amount,
        totalAmount: amount,
        merchant: outing.name || category,
        category,
        account: accountLabel,
        accountName: accountLabel,
        rollupAccountNames: accountNames,
        outingExpenseTitles: expenseTitles,
        purpose: PERSONAL_PURPOSE_ID,
        purposeId: PERSONAL_PURPOSE_ID,
        source: "manual",
        entrySource: "manual",
        date: dateIso,
        transactionDate: dateIso,
        note: `Outing · ${category}`,
        description: `Outing · ${category}`,
        paymentMethod: "UPI",
        status: "completed",
        outingId: outing.id,
        tags: [OUTING_ANALYTICS_TAG],
      });
    }
  }

  const base = transactions.filter((tx) => {
    if (isOutingRollupTransaction(tx)) return false;

    if (!includeOutingExpenses) {
      if (tx.outingId) return false;
      if (linkedLedgerIds.has(tx.id)) return false;
      if (tx.tags?.includes(OUTING_ANALYTICS_TAG)) return false;
      return true;
    }

    if (tx.outingId && summarizedOutingIds.has(tx.outingId)) return false;
    if (linkedLedgerIds.has(tx.id) && summarizedOutingIds.size > 0) {
      // Linked bank row already folded into its outing total above.
      const linkedExpense = expenses.find((e) => e.linkedTransactionId === tx.id);
      if (linkedExpense && summarizedOutingIds.has(linkedExpense.outingId)) {
        return false;
      }
    }
    if ((tx.tags ?? []).includes(OUTING_ANALYTICS_TAG)) return false;
    return true;
  });

  return [...base, ...synthetic];
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
      (totals.get(transaction.merchant) ?? 0) + transaction.totalAmount,
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

function getTransactionCategoryNames(transaction: Transaction) {
  if (transaction.splits?.length) {
    return transaction.splits
      .map((split) => split.categoryId?.trim())
      .filter((name): name is string => Boolean(name));
  }
  return transaction.category?.trim() ? [transaction.category.trim()] : [];
}

function transactionMatchesFilterPurpose(
  transaction: Transaction,
  purposeId: string,
  purposes: Purpose[],
) {
  if (transaction.splits?.length) {
    return transaction.splits.some((split) =>
      transactionMatchesPurpose(split.purposeId, purposeId, purposes),
    );
  }
  return transactionMatchesPurpose(transaction.purposeId, purposeId, purposes);
}

function matchesCategoryFilters(transaction: Transaction, filters: AnalyticsFilters) {
  const selectedCategories = new Set(filters.categories);
  const groupCategories = filters.categoryGroup
    ? getCategoriesForGroup(filters.categoryGroup)
    : [];
  const transactionCategories = getTransactionCategoryNames(transaction);

  if (groupCategories.length > 0) {
    if (selectedCategories.size > 0) {
      return transactionCategories.some(
        (category) =>
          selectedCategories.has(category) && groupCategories.includes(category),
      );
    }
    return transactionCategories.some((category) =>
      groupCategories.includes(category),
    );
  }

  if (selectedCategories.size > 0) {
    return transactionCategories.some((category) =>
      selectedCategories.has(category),
    );
  }

  return true;
}

/** Category breakdown follows the Analysis month/date selector only. */
export function filtersForCategoryBreakdown(
  filters: AnalyticsFilters,
): AnalyticsFilters {
  return {
    ...filters,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    datePreset: filters.datePreset,
    purposeId: filters.purposeId,
    purpose: filters.purpose,
    categories: [],
    categoryGroup: "",
    account: "",
    source: "",
    contributorSource: "",
    search: "",
    merchant: "",
    tags: [],
    minAmount: "",
    maxAmount: "",
    transactionType: "",
    transactionStatus: "",
    outingType: "",
    outingWithWhom: "",
    outingStatus: "",
    compareMode: "",
  };
}

/** Top merchants follow the Analysis month/date selector only. */
export function filtersForTopMerchants(
  filters: AnalyticsFilters,
): AnalyticsFilters {
  return {
    ...filters,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    datePreset: filters.datePreset,
    purposeId: filters.purposeId,
    purpose: filters.purpose,
    categories: [],
    categoryGroup: "",
    account: "",
    source: "",
    contributorSource: "",
    search: "",
    merchant: "",
    tags: [],
    minAmount: "",
    maxAmount: "",
    transactionType: "",
    transactionStatus: "",
    outingType: "",
    outingWithWhom: "",
    outingStatus: "",
    compareMode: "",
  };
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
    transactions,
  );

  const included = transactions.filter((transaction) => {
    const rawDate = transaction.transactionDate ?? transaction.date ?? "";
    const parsedDate = new Date(
      rawDate.includes("T") ? rawDate : `${rawDate}T12:00:00`,
    );
    const dayKey = Number.isNaN(parsedDate.getTime())
      ? ""
      : `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
    const fromKey = filters.dateFrom || "";
    const toKey = filters.dateTo || "";
    const amount = Math.abs(transaction.totalAmount ?? transaction.amount ?? 0);
    const status = normalizeStatus(transaction.status);

    return (
      (!fromKey || (dayKey && dayKey >= fromKey)) &&
      (!toKey || (dayKey && dayKey <= toKey)) &&
      matchesCategoryFilters(transaction, filters) &&
      (!filters.account ||
        transaction.accountId === filters.account ||
        transaction.account === filters.account) &&
      (!filters.source || transaction.source === filters.source) &&
      (!filters.purposeId ||
        transactionMatchesFilterPurpose(
          transaction,
          filters.purposeId,
          context.purposes ?? [],
        )) &&
      (!filters.contributorSource ||
        (transaction.contributorSource || "Me") === filters.contributorSource) &&
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
          transaction.accountName,
          transaction.purposeId,
          transaction.note,
          ...(transaction.tags ?? []),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search)))
    );
  });

  // Every calculation downstream (Dashboard KPIs, Analysis charts, Wealth)
  // must use the matched split amount, not the whole transaction total —
  // same rule as the Transactions page. categoryGroup is a broader "any
  // category in this group" match with no split-level equivalent, so it's
  // left as inclusion-only rather than guessing which split to narrow to.
  if (filters.categoryGroup) return included;
  return narrowTransactionsToFilter(
    included,
    { categories: filters.categories, purposeId: filters.purposeId },
    context.purposes ?? [],
  );
}

export function sortAnalyticsTransactions(
  transactions: Transaction[],
  sortBy: AnalyticsSortBy = "newest",
) {
  return [...transactions].sort((a, b) => {
    if (sortBy === "newest") {
      return (
        new Date(b.transactionDate).getTime() -
        new Date(a.transactionDate).getTime()
      );
    }
    if (sortBy === "oldest") {
      return (
        new Date(a.transactionDate).getTime() -
        new Date(b.transactionDate).getTime()
      );
    }
    if (sortBy === "amount-high") return b.totalAmount - a.totalAmount;
    if (sortBy === "amount-low") return a.totalAmount - b.totalAmount;
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
    transactions,
  );
  const outingIds = new Set<string>();

  for (const transaction of transactions) {
    const meta = outingIndex.get(transaction.id);
    if (meta) outingIds.add(meta.outingId);
  }

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);
  const totalExpense = transactions
    .filter((transaction) => isSpendingExpense(transaction))
    .reduce((sum, transaction) => sum + transaction.totalAmount, 0);

  return {
    transactionCount: transactions.length,
    totalIncome,
    totalExpense,
    categoryCount: new Set(transactions.map((transaction) => transaction.category))
      .size,
    accountCount: new Set(transactions.map((transaction) => transaction.accountId))
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