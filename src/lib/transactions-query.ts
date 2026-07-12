import type { QueryConstraint } from "firebase/firestore";
import { orderBy, where } from "firebase/firestore";
import { deriveMonthKey } from "@/lib/firestore-schema";
import type { GlobalFilters, Transaction } from "@/types";

export type FirestoreTransactionFilters = Pick<
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

export function canUseFirestoreTransactionQuery(filters: GlobalFilters) {
  return filters.categories.length <= 10;
}

export function resolveMonthKeyFilter(filters: FirestoreTransactionFilters) {
  if (!filters.dateFrom || !filters.dateTo) return null;

  const fromMonth = deriveMonthKey(filters.dateFrom);
  const toMonth = deriveMonthKey(filters.dateTo);

  if (fromMonth === toMonth) return fromMonth;
  if (filters.dashboardMonth) return filters.dashboardMonth;
  return null;
}

export function buildTransactionQueryConstraints(
  userId: string,
  filters: FirestoreTransactionFilters,
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [where("userId", "==", userId)];
  const monthKey = resolveMonthKeyFilter(filters);

  if (monthKey) {
    constraints.push(where("monthKey", "==", monthKey));
  } else {
    if (filters.dateFrom) {
      constraints.push(where("date", ">=", filters.dateFrom));
    }
    if (filters.dateTo) {
      constraints.push(where("date", "<=", `${filters.dateTo}T23:59:59.999Z`));
    }
  }

  if (filters.purposeId) {
    constraints.push(where("purpose", "==", filters.purposeId));
  }

  if (filters.transactionType) {
    constraints.push(where("type", "==", filters.transactionType));
  }

  if (filters.account) {
    constraints.push(where("account", "==", filters.account));
  }

  if (filters.source) {
    const entrySource =
      filters.source === "mobile"
        ? "mobile-manual"
        : filters.source === "import" || filters.source === "bank-sync"
          ? "sms-auto-detected"
          : "manual";
    constraints.push(where("entrySource", "==", entrySource));
  }

  if (filters.categories.length > 0 && filters.categories.length <= 10) {
    constraints.push(where("category", "in", filters.categories));
  }

  constraints.push(orderBy("date", "desc"));
  return constraints;
}

/** Filters Firestore cannot express: search, amount range, >10 categories */
export function applyClientTransactionFilters(
  transactions: Transaction[],
  filters: GlobalFilters,
) {
  const search = filters.search.trim().toLowerCase();

  return transactions.filter((transaction) => {
    const amount = Math.abs(transaction.amount);

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

    if (!search) return true;

    return [
      transaction.merchant,
      transaction.description,
      transaction.category,
      transaction.account,
      transaction.purpose,
      transaction.note,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(search));
  });
}

export function toFirestoreTransactionFilters(
  filters: GlobalFilters,
): FirestoreTransactionFilters {
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

export function applyFirestoreTransactionFilters(
  transactions: Transaction[],
  filters: FirestoreTransactionFilters,
) {
  const dateTo = filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : "";

  return transactions.filter((transaction) => {
    if (filters.purposeId && transaction.purpose !== filters.purposeId) {
      return false;
    }
    if (filters.transactionType && transaction.type !== filters.transactionType) {
      return false;
    }
    if (filters.account && transaction.account !== filters.account) {
      return false;
    }
    if (filters.source) {
      const entrySource = transaction.entrySource ?? transaction.source;
      if (entrySource !== filters.source && transaction.source !== filters.source) {
        return false;
      }
    }
    if (filters.dateFrom && transaction.date < filters.dateFrom) {
      return false;
    }
    if (dateTo && transaction.date > dateTo) {
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