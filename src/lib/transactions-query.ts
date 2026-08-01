import { deriveMonthKey } from "@/lib/data-schema";
import type { GlobalFilters, Transaction } from "@/types";

export type ServerTransactionFilters = Pick<
  GlobalFilters,
  | "dateFrom"
  | "dateTo"
  | "transactionType"
  | "account"
  | "source"
  | "categories"
  | "purposeId"
  | "dashboardMonth"
>;

export function canUseServerTransactionQuery(filters: GlobalFilters) {
  return filters.categories.length <= 10;
}

export function resolveMonthKeyFilter(filters: ServerTransactionFilters) {
  if (!filters.dateFrom || !filters.dateTo) return null;

  const fromMonth = deriveMonthKey(filters.dateFrom);
  const toMonth = deriveMonthKey(filters.dateTo);

  if (fromMonth === toMonth) return fromMonth;
  if (filters.dashboardMonth) return filters.dashboardMonth;
  return null;
}

export function buildTransactionQueryConstraints(
  userId: string,
  filters: ServerTransactionFilters,
): Array<{ field: string; op: string; value: string }> {
  const constraints: Array<{ field: string; op: string; value: string }> = [
    { field: "user_id", op: "eq", value: userId },
  ];
  const monthKey = resolveMonthKeyFilter(filters);

  if (monthKey) {
    constraints.push({ field: "month_key", op: "eq", value: monthKey });
  } else {
    if (filters.dateFrom) {
      constraints.push({
        field: "transaction_date",
        op: "gte",
        value: filters.dateFrom,
      });
    }
    if (filters.dateTo) {
      constraints.push({
        field: "transaction_date",
        op: "lte",
        value: `${filters.dateTo}T23:59:59.999Z`,
      });
    }
  }

  if (filters.transactionType) {
    constraints.push({ field: "type", op: "eq", value: filters.transactionType });
  }
  if (filters.account) {
    constraints.push({ field: "account_id", op: "eq", value: filters.account });
  }

  return constraints;
}

/** Filters applied client-side: search, amount range, >10 categories, contributor */
export function applyClientTransactionFilters(
  transactions: Transaction[],
  filters: GlobalFilters,
) {
  const search = filters.search.trim().toLowerCase();

  return transactions.filter((transaction) => {
    const amount = Math.abs(transaction.totalAmount);

    if (
      filters.categories.length > 10 &&
      filters.categories.length > 0 &&
      !filters.categories.includes(transaction.category)
    ) {
      return false;
    }

    if (filters.minAmount && amount < Number(filters.minAmount)) {
      return false;
    }

    if (filters.maxAmount && amount > Number(filters.maxAmount)) {
      return false;
    }

    if (
      filters.contributorSource &&
      (transaction.contributorSource || "Me") !== filters.contributorSource
    ) {
      return false;
    }

    if (!search) return true;

    const mainMatch = [
      transaction.merchant,
      transaction.description,
      transaction.category,
      transaction.accountName,
      transaction.purposeId,
      transaction.note,
      transaction.title,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(search));

    if (mainMatch) return true;

    if (transaction.outingExpenseTitles?.length) {
      if (
        transaction.outingExpenseTitles.some((title) =>
          title.toLowerCase().includes(search),
        )
      ) {
        return true;
      }
    }

    if (transaction.items?.length) {
      return transaction.items.some((item) =>
        item.name.toLowerCase().includes(search),
      );
    }

    return false;
  });
}

export function toServerTransactionFilters(
  filters: GlobalFilters,
): ServerTransactionFilters {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    transactionType: filters.transactionType,
    account: filters.account,
    source: filters.source,
    categories: filters.categories.slice(0, 10),
    purposeId: filters.purposeId,
    dashboardMonth: filters.dashboardMonth,
  };
}

export function applyServerTransactionFilters(
  transactions: Transaction[],
  filters: ServerTransactionFilters,
) {
  const dateTo = filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : "";

  return transactions.filter((transaction) => {
    const transactionDate =
      transaction.transactionDate ?? transaction.date ?? "";

    if (filters.purposeId && transaction.purposeId !== filters.purposeId) {
      return false;
    }
    if (filters.transactionType && transaction.type !== filters.transactionType) {
      return false;
    }
    if (
      filters.account &&
      transaction.accountId !== filters.account &&
      transaction.account !== filters.account
    ) {
      return false;
    }
    if (filters.source) {
      const entrySource = transaction.entrySource ?? transaction.source;
      if (entrySource !== filters.source && transaction.source !== filters.source) {
        return false;
      }
    }
    if (filters.dateFrom && transactionDate < filters.dateFrom) {
      return false;
    }
    if (dateTo && transactionDate > dateTo) {
      return false;
    }
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(transaction.category)
    ) {
      return false;
    }
    return true;
  });
}