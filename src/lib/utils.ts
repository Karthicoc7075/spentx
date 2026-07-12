import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { transactionMatchesPurpose } from "@/lib/purposes";
import type { GlobalFilters, Purpose, Transaction } from "@/types";

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

// App-wide display preferences, applied from the user's saved settings (see
// applyUserPreferences). Kept as module state so every formatCurrency call
// site honours them without threading props through the whole tree.
let activeCurrency = "INR";
let globalPrivateMode = false;

export function setActiveCurrency(code: string | undefined) {
  if (code && CURRENCY_META[code]) activeCurrency = code;
}

export function getActiveCurrency() {
  return activeCurrency;
}

export function setGlobalPrivateMode(value: boolean) {
  globalPrivateMode = value;
}

export function getGlobalPrivateMode() {
  return globalPrivateMode;
}

/**
 * Formats a value in the user's selected currency. `privateMode` and
 * `currency` default to the app-wide preferences, so callers can omit them and
 * still respect "Private Hiding Mode" and the currency chosen in Settings.
 */
export function formatCurrency(
  value: number,
  privateMode: boolean = globalPrivateMode,
  currency: string = activeCurrency,
) {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.INR;
  if (privateMode) return `${meta.symbol}••••••`;

  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string, pattern = "dd MMM yyyy") {
  return format(new Date(value), pattern);
}

export function formatDateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

export function toCsv(rows: Transaction[]) {
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
  ];

  const escape = (value: string | number | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  return [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.date,
        row.merchant,
        row.category,
        row.account,
        row.amount,
        row.type,
        row.purpose,
        row.source,
        row.reference,
        row.note,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
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
  if (filterSource === "mobile" && entrySource === "mobile-manual") return true;
  if (filterSource === "import" && entrySource === "sms-auto-detected") return true;
  if (filterSource === "manual" && (!entrySource || entrySource === "manual")) {
    return true;
  }

  return false;
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

  return transactions.filter((transaction) => {
    const date = new Date(transaction.date).getTime();
    const from = filters.dateFrom
      ? new Date(filters.dateFrom).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = filters.dateTo
      ? new Date(`${filters.dateTo}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;
    const amount = Math.abs(Number(transaction.amount));
    const matchesDate = !hasDateFilter
      ? true
      : Number.isFinite(date) && date >= from && date <= to;

    return (
      matchesDate &&
      (!filters.categories.length ||
        filters.categories.includes(transaction.category)) &&
      (!filters.account || transaction.account === filters.account) &&
      (!filters.source || matchesTransactionSource(transaction, filters.source)) &&
      (!filters.minAmount || amount >= Number(filters.minAmount)) &&
      (!filters.maxAmount || amount <= Number(filters.maxAmount)) &&
      (!filters.transactionType ||
        transaction.type === filters.transactionType) &&
      transactionMatchesPurpose(
        transaction.purpose,
        filters.purposeId,
        purposes,
      ) &&
      (!filters.contributorSource ||
        transaction.contributorSource === filters.contributorSource) &&
      (!search ||
        [
          transaction.merchant,
          transaction.description,
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
