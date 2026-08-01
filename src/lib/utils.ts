import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  getPurposeDisplayName,
  transactionMatchesPurpose,
} from "@/lib/purposes";
import type { GlobalFilters, Purpose, Transaction } from "@/types";

export function transactionDateKey(
  transaction: Pick<Transaction, "date" | "transactionDate">,
) {
  return transaction.transactionDate ?? transaction.date ?? "";
}

export function compareTransactionsNewestFirst(
  a: Pick<Transaction, "date" | "transactionDate">,
  b: Pick<Transaction, "date" | "transactionDate">,
) {
  return transactionDateKey(b).localeCompare(transactionDateKey(a));
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CurrencyMeta = { locale: string; symbol: string };

const CURRENCY_META: Record<string, CurrencyMeta> = {
  INR: { locale: "en-IN", symbol: "₹" },
  USD: { locale: "en-US", symbol: "$" },
  EUR: { locale: "en-IE", symbol: "€" },
  GBP: { locale: "en-GB", symbol: "£" },
};

// FIRESTORE_REBUILD_SPEC Step 8.2 — the Currency selector was removed from
// Settings and formatCurrency is now hard-coded to INR. The app-wide
// "Private Hiding Mode" preference is still honoured via globalPrivateMode.
let globalPrivateMode = false;

// Retained no-op so any lingering callers of setActiveCurrency don't break;
// currency is fixed to INR regardless of the argument.
export function setActiveCurrency(_code?: string) {
  // currency is fixed to INR (spec Step 8.2)
}

export function getActiveCurrency() {
  return "INR";
}

export function setGlobalPrivateMode(value: boolean) {
  globalPrivateMode = value;
}

export function getGlobalPrivateMode() {
  return globalPrivateMode;
}

/**
 * Formats a value in INR (spec Step 8.2). `privateMode` defaults to the
 * app-wide "Private Hiding Mode" preference so callers can omit it.
 */
export function formatCurrency(
  value: number,
  privateMode: boolean = globalPrivateMode,
) {
  const meta = CURRENCY_META.INR;
  if (privateMode) return `${meta.symbol}••••••`;

  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string, pattern = "dd MMM yyyy") {
  return format(new Date(value), pattern);
}

export function formatDateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

/**
 * Transactions CSV. Split Expense rows list every category and purpose in
 * their columns; pass `purposes` for readable purpose names and
 * `detailed: true` to also emit one line per split row.
 */
export function toCsv(
  rows: Transaction[],
  options: { purposes?: Purpose[]; detailed?: boolean } = {},
) {
  const { purposes = [], detailed = false } = options;
  const headers = [
    "Date",
    "Merchant",
    "Category",
    "Account",
    "Amount",
    "Type",
    "Purpose",
    "Source",
    "Reference",
    "Note",
    "Split Row",
    "Split Category",
    "Split Purpose",
    "Split Amount",
  ];

  const escape = (value: string | number | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const purposeLabel = (id?: string) =>
    purposes.length > 0 ? getPurposeDisplayName(id, purposes) : (id ?? "");

  const lines: string[] = [headers.join(",")];

  for (const row of rows) {
    const categories = transactionCategoryNames(row).join(" | ");
    const purposeNames = transactionPurposeIds(row).map(purposeLabel).join(" | ");
    const base = [
      transactionDateKey(row),
      row.merchant,
      categories,
      row.account,
      row.amount,
      row.type,
      purposeNames,
      row.source,
      row.reference,
      row.note,
    ];

    lines.push([...base, "", "", "", ""].map(escape).join(","));

    if (detailed && isSplitExpenseTransaction(row)) {
      (row.splits ?? []).forEach((split, index) => {
        lines.push(
          [
            ...base,
            index + 1,
            split.categoryId ?? "",
            purposeLabel(split.purposeId),
            split.amount,
          ]
            .map(escape)
            .join(","),
        );
      });
    }
  }

  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function matchesTransactionSource(
  transaction: Transaction,
  filterSource: string,
) {
  if (transaction.source === filterSource) return true;

  const entrySource = transaction.entrySource;
  // Mobile app rows: source=mobile (manual or SMS); SMS also sets entry_source.
  if (filterSource === "mobile") {
    return (
      transaction.source === "mobile" ||
      transaction.source === "bank-sync" ||
      entrySource === "mobile-manual" ||
      entrySource === "sms-auto-detected"
    );
  }
  if (filterSource === "import" && entrySource === "sms-auto-detected") return true;
  if (filterSource === "manual" && (!entrySource || entrySource === "manual")) {
    // Web-manual and outing cash synthetics (no mobile source).
    return transaction.source === "manual" || !transaction.source;
  }

  return false;
}

function dayKey(value: string) {
  if (!value) return "";
  // Prefer YYYY-MM-DD so timezone shifts don't drop cash/outing rows.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function transactionAccountLabel(transaction: Transaction) {
  return (transaction.accountName || transaction.account || "").trim();
}

function transactionMoney(transaction: Transaction) {
  const value = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/** True if this transaction has real multi-row splits (Split Expense) —
 * a single-split transaction is treated as a plain single category/purpose
 * everywhere below, same as before splits existed. */
function hasMultiSplit(transaction: Transaction) {
  return Boolean(transaction.hasSplits) && (transaction.splits?.length ?? 0) > 1;
}

/** True when this row carries several category/purpose splits. */
export function isSplitExpenseTransaction(transaction: Transaction) {
  return hasMultiSplit(transaction);
}

/**
 * Every distinct category on a transaction — one entry for a normal row, all
 * split categories for a Split Expense. Order follows the split rows so the
 * list reads the same way the detail panel does.
 */
export function transactionCategoryNames(transaction: Transaction): string[] {
  if (!hasMultiSplit(transaction)) {
    return transaction.category ? [transaction.category] : [];
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const split of transaction.splits ?? []) {
    const name = (split.categoryId || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names.length > 0 ? names : transaction.category ? [transaction.category] : [];
}

/**
 * Every distinct purpose id on a transaction. Callers map these through
 * getPurposeDisplayName for labels.
 */
export function transactionPurposeIds(transaction: Transaction): string[] {
  if (!hasMultiSplit(transaction)) {
    const id = transaction.purposeId ?? transaction.purpose;
    return id ? [id] : [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const split of transaction.splits ?? []) {
    const id = (split.purposeId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > 0) return ids;
  const fallback = transaction.purposeId ?? transaction.purpose;
  return fallback ? [fallback] : [];
}

/**
 * "Food, Shopping +2" — first `visible` names, then an overflow count.
 * Keeps a long split from blowing out the column width.
 */
export function summariseNames(names: string[], visible = 2) {
  const shown = names.slice(0, visible);
  const overflow = names.length - shown.length;
  return { shown, overflow, label: shown.join(", ") + (overflow > 0 ? ` +${overflow}` : "") };
}

/** Does a single split row (or a plain transaction's own category/purpose)
 * satisfy the active Category AND Purpose filters, jointly? Shared by list
 * filtering, list display-amount summing, and detail-panel row highlighting
 * so all three can never disagree about what "matches" means. */
export function splitRowMatchesFilters(
  row: { categoryId?: string; purposeId?: string },
  filters: Pick<GlobalFilters, "categories" | "purposeId">,
  purposes: Purpose[],
) {
  const categoryOk =
    !filters.categories.length || filters.categories.includes(row.categoryId ?? "");
  const purposeOk = transactionMatchesPurpose(
    row.purposeId,
    filters.purposeId,
    purposes,
  );
  return categoryOk && purposeOk;
}

type MatchedSplitRow = { amount: number; categoryId?: string; purposeId?: string };

/** The split rows (real splits, or the whole transaction as one implicit
 * row) that satisfy the active Category/Purpose filters. Empty when a
 * filter is active and nothing matches — the transaction should be hidden.
 * When no Category/Purpose filter is active, always returns the whole
 * transaction as a single row (unaffected — "Normal View (No Filters)").
 * Exported so callers outside the Transactions page (Dashboard/Analysis/
 * Wealth) can build the same filtered+split-narrowed dataset instead of
 * re-deriving their own — see `narrowTransactionsToFilter` below. */
export function matchingTransactionSplits(
  transaction: Transaction,
  filters: Pick<GlobalFilters, "categories" | "purposeId">,
  purposes: Purpose[],
): MatchedSplitRow[] {
  const filterActive = filters.categories.length > 0 || Boolean(filters.purposeId);
  if (!filterActive) {
    return [{ amount: transactionMoney(transaction) }];
  }

  if (!hasMultiSplit(transaction)) {
    const categoryId = transaction.category;
    const purposeId = transaction.purposeId ?? transaction.purpose;
    const matches = splitRowMatchesFilters({ categoryId, purposeId }, filters, purposes);
    return matches ? [{ amount: transactionMoney(transaction), categoryId, purposeId }] : [];
  }

  return transaction
    .splits!.filter((split) => splitRowMatchesFilters(split, filters, purposes))
    .map((split) => ({
      amount: split.amount,
      categoryId: split.categoryId,
      purposeId: split.purposeId,
    }));
}

/**
 * Filters AND narrows a transaction list so every calculation built on top
 * (Dashboard KPIs, Net Worth, Analysis charts, Wealth) uses the same
 * matched-split amount as the Transactions page instead of the whole
 * transaction total. A transaction with several matching splits (e.g. a
 * "Purpose + Category" split with two different categories, both Personal)
 * is expanded into one synthetic row per matching split — carrying that
 * split's own amount/category/purpose — so category-based aggregation
 * (Top Categories, Category Breakdown) still attributes each slice
 * correctly instead of collapsing them into one row under one category.
 *
 * No-op when no Purpose/Category filter is active, and for any transaction
 * that isn't a real multi-split — those are returned unchanged so callers
 * with their own split-aware logic (e.g. buildCategoryTotals) keep working
 * off the real `splits` array exactly as before.
 */
export function narrowTransactionsToFilter(
  transactions: Transaction[],
  filters: Pick<GlobalFilters, "categories" | "purposeId">,
  purposes: Purpose[] = [],
): Transaction[] {
  const filterActive = filters.categories.length > 0 || Boolean(filters.purposeId);
  if (!filterActive) return transactions;

  const result: Transaction[] = [];
  for (const transaction of transactions) {
    if (!hasMultiSplit(transaction)) {
      const matches = matchingTransactionSplits(transaction, filters, purposes);
      if (matches.length > 0) result.push(transaction);
      continue;
    }

    const matches = matchingTransactionSplits(transaction, filters, purposes);
    matches.forEach((split, index) => {
      result.push({
        ...transaction,
        id: matches.length > 1 ? `${transaction.id}::split:${index}` : transaction.id,
        amount: split.amount,
        totalAmount: split.amount,
        category: split.categoryId || transaction.category,
        purpose: split.purposeId || transaction.purpose,
        purposeId: split.purposeId || transaction.purposeId,
        hasSplits: false,
        splits: undefined,
      });
    });
  }
  return result;
}

/** Sum of the split rows matching the active Category/Purpose filters — the
 * total when no such filter is active, the matched slice(s) otherwise. */
export function computeFilteredDisplayAmount(
  transaction: Transaction,
  filters: Pick<GlobalFilters, "categories" | "purposeId">,
  purposes: Purpose[],
) {
  return matchingTransactionSplits(transaction, filters, purposes).reduce(
    (sum, row) => sum + row.amount,
    0,
  );
}

export function hasActiveTransactionFilters(filters: GlobalFilters) {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.categories.length ||
      filters.account ||
      filters.source ||
      filters.search.trim() ||
      filters.minAmount ||
      filters.maxAmount ||
      filters.transactionType ||
      filters.purposeId ||
      filters.contributorSource,
  );
}

export function filterTransactions(
  transactions: Transaction[],
  filters: GlobalFilters,
  purposes: Purpose[] = [],
) {
  if (!hasActiveTransactionFilters(filters)) {
    return transactions;
  }

  const search = filters.search.trim().toLowerCase();
  const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);
  const fromDay = filters.dateFrom ? dayKey(filters.dateFrom) : "";
  const toDay = filters.dateTo ? dayKey(filters.dateTo) : "";
  const accountFilter = filters.account.trim().toLowerCase();

  return transactions.filter((transaction) => {
    const txDay = dayKey(transactionDateKey(transaction));
    const matchesDate =
      !hasDateFilter ||
      (Boolean(txDay) &&
        (!fromDay || txDay >= fromDay) &&
        (!toDay || txDay <= toDay));

    const amount = Math.abs(transactionMoney(transaction));
    const accountLabel = transactionAccountLabel(transaction);
    const matchesAccount =
      !accountFilter ||
      accountLabel.toLowerCase() === accountFilter ||
      (transaction.accountId ?? "").toLowerCase() === accountFilter ||
      // Outing rollup rows read "Mixed" but should still match any account
      // the user actually paid from on that trip.
      (transaction.rollupAccountNames ?? []).some(
        (name) => name.trim().toLowerCase() === accountFilter,
      );

    const payment = (
      transaction.paymentMethod ||
      transaction.paymentType ||
      ""
    ).toLowerCase();

    return (
      matchesDate &&
      matchingTransactionSplits(transaction, filters, purposes).length > 0 &&
      matchesAccount &&
      (!filters.source || matchesTransactionSource(transaction, filters.source)) &&
      (!filters.minAmount || amount >= Number(filters.minAmount)) &&
      (!filters.maxAmount || amount <= Number(filters.maxAmount)) &&
      (!filters.transactionType ||
        transaction.type === filters.transactionType) &&
      (!filters.contributorSource ||
        (transaction.contributorSource || "Me") === filters.contributorSource) &&
      (!search ||
        [
          transaction.merchant,
          transaction.description,
          accountLabel,
          transaction.note,
          payment,
          // Every split category + purpose, so searching "Medicine" finds a
          // Split Expense whose third row is Medicine.
          ...transactionCategoryNames(transaction),
          ...transactionPurposeIds(transaction),
          ...transactionPurposeIds(transaction).map((id) =>
            getPurposeDisplayName(id, purposes),
          ),
          // Outing rollup rows index their child expense titles.
          ...(transaction.outingExpenseTitles ?? []),
          ...(transaction.tags ?? []),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search)))
    );
  });
}
