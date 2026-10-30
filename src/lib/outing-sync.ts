import { isConfirmedTransaction } from "@/lib/transaction-status";
import { buildExpenseSplits } from "@/lib/outings";
import type { Outing, OutingExpense, Transaction } from "@/types";

/** Tag applied when user unlinks a spend so auto-add will not re-attach it. */
export const OUTING_UNLINKED_TAG = "outing-unlinked";

export function hasOutingUnlinkedOptOut(transaction: Transaction) {
  return (transaction.tags ?? []).includes(OUTING_UNLINKED_TAG);
}

/** Missing autoAddMode is on. Old trips were created with auto-add on. */
export function outingAutoAddEnabled(outing: {
  autoAddMode?: boolean | null;
}): boolean {
  return outing.autoAddMode !== false;
}

export function withOutingUnlinkedTag(tags?: string[]) {
  const next = (tags ?? []).filter((t) => t !== OUTING_UNLINKED_TAG);
  next.push(OUTING_UNLINKED_TAG);
  return next;
}

export function withoutOutingUnlinkedTag(tags?: string[]) {
  return (tags ?? []).filter((t) => t !== OUTING_UNLINKED_TAG);
}

/** Same financial status rule as spending and balances. */
export const isOutingSpendStatus = isConfirmedTransaction;

type WallClock = {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
  /** Written as a date only (no time, or exactly midnight). */
  dateOnly: boolean;
  /** "YYYY-MM-DD" as written. */
  day: string;
};

const WALL_CLOCK =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Date and time exactly as written, offset ignored. Trip start / end are
 * wall-clock values: web saves a bare date (stored as `T00:00:00Z`) and the
 * mobile app saves its local time without an offset (stored as if UTC), so
 * `2026-10-22T14:07:33+00:00` means 2:07 pm on the user's clock.
 */
function wallClock(value: string): WallClock | null {
  const m = WALL_CLOCK.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  const ms = Number(((m[7] ?? "") + "000").slice(0, 3));
  return {
    y,
    m: mo,
    d,
    h,
    mi,
    s,
    ms,
    dateOnly: h === 0 && mi === 0 && s === 0 && ms === 0,
    day: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

/** The viewer's IANA time zone (the browser's, where the sync runs). */
function viewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Offset of [timeZone] from UTC at instant [utcMs], in ms. */
function zoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a wall-clock time happens in [timeZone]. */
function zonedMs(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  ms: number,
  timeZone: string,
) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s, ms);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return second;
}

function nextDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Whether a transaction that happened at [at] belongs inside the trip
 * window: from the moment the trip started to the end of its last day.
 *
 *  - A trip started with a time (the mobile app stores the activation
 *    time) begins at that moment: an earlier same-day spend stays out.
 *  - A date-only start means the whole start day.
 *  - [at] with a time is an instant (the mobile app sends UTC); a
 *    date-only [at] cannot be shown to be after a timed start on the same
 *    day, so it joins only from the next day (or any day of a date-only
 *    start).
 *
 * [timeZone] is the calendar the dates belong to — the viewer's by
 * default. Never relies on a server's local zone when one is passed.
 */
export function isWithinOutingWindow(
  outing: Outing,
  at: string,
  timeZone: string = viewerTimeZone(),
) {
  if (!at || !outing.startDate) return false;
  const start = wallClock(outing.startDate);
  if (!start) return false;
  const end = wallClock(outing.endDate || outing.startDate);
  if (!end) return false;

  const tx = wallClock(at);
  if (tx && tx.dateOnly && !/[T ]/.test(at.trim())) {
    // Bare "YYYY-MM-DD" transaction date.
    if (tx.day > end.day) return false;
    if (tx.day > start.day) return true;
    return start.dateOnly && tx.day === start.day;
  }

  const txMs = Date.parse(at);
  if (!Number.isFinite(txMs)) return false;
  const startMs = start.dateOnly
    ? zonedMs(start.y, start.m, start.d, 0, 0, 0, 0, timeZone)
    : zonedMs(
        start.y,
        start.m,
        start.d,
        start.h,
        start.mi,
        start.s,
        start.ms,
        timeZone,
      );
  const [ny, nm, nd] = nextDay(end.day).split("-").map(Number);
  const endMs = zonedMs(ny, nm, nd, 0, 0, 0, 0, timeZone) - 1;
  return txMs >= startMs && txMs <= endMs;
}

/** Inclusive calendar range for an outing (startDate through endDate, or single day on startDate). */
export function isWithinOutingDates(outing: Outing, date: string) {
  if (!date || !outing.startDate) return false;
  const txDate = date.slice(0, 10);
  const start = outing.startDate.slice(0, 10);
  const end = outing.endDate ? outing.endDate.slice(0, 10) : start;
  return txDate >= start && txDate <= end;
}

import { getLocalTodayDateStr } from "@/lib/outing-display";

/** Currently running outing that should auto-attach new spends. */
export function getActiveAutoOuting(outings: Outing[]): Outing | null {
  const today = getLocalTodayDateStr();
  const active = outings.filter(
    (o) =>
      o.status === "active" &&
      !o.isQuickSplit &&
      o.isActive !== false &&
      outingAutoAddEnabled(o) &&
      isWithinOutingDates(o, today),
  );
  if (active.length === 0) return null;
  return [...active].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  )[0];
}

export function hasOtherActiveOuting(
  outings: Outing[],
  excludeOutingId?: string,
) {
  const today = getLocalTodayDateStr();
  return outings.some(
    (o) =>
      o.status === "active" &&
      o.id !== excludeOutingId &&
      o.isActive !== false &&
      isWithinOutingDates(o, today),
  );
}

/**
 * True only for a transaction the system linked to a real outing BY ITSELF
 * (SMS detection / bank sync / import) — the only case that offers Unlink.
 *
 * `outing_expenses.source === "bank-detected"` is the schema's only auto-link
 * marker: it is written exclusively by [buildOutingExpenseFromTransaction]
 * below. (`Transaction.isAutoDetected` exists in the types but is never read
 * or written anywhere, so it cannot be used.)
 *
 * Deliberately false for manual outing expenses (no linked ledger row),
 * manually linked transactions, and friend splits (hidden quick-split
 * outings) — those are undone by editing the transaction instead.
 */
export function isAutoLinkedOutingTransaction(
  outing: Outing | undefined | null,
  linkedExpense: OutingExpense | undefined | null,
) {
  if (!outing || outing.isQuickSplit) return false;
  if (!linkedExpense?.linkedTransactionId) return false;
  return linkedExpense.source === "bank-detected";
}

/** Bank/SMS/import rows may auto-join an active trip. Manual ledger adds must not. */
export function isBankLikeTransactionSource(transaction: Transaction) {
  const source = (transaction.source ?? "").toLowerCase();
  const entry = (transaction.entrySource ?? "").toLowerCase();
  if (
    source === "manual" ||
    entry === "manual" ||
    entry === "mobile-manual" ||
    entry.includes("manual")
  ) {
    return false;
  }
  return (
    source === "bank-sync" ||
    source === "sms" ||
    source === "import" ||
    entry.includes("sms") ||
    entry.includes("bank") ||
    entry.includes("auto-detected")
  );
}

/**
 * Outings that should receive this ledger expense automatically.
 *
 * Rules (one transaction = normal OR outing, never both / never forced):
 *  - If user already set outingId → reconcile that outing only
 *  - If user opted out (outing-unlinked tag) → none
 *  - Auto-link ONLY bank/SMS/import rows during active auto-add trips,
 *    inside the trip window (start moment → end of last day)
 *  - Never a pending / failed / cancelled / reversed / rejected payment
 *  - Manual web/app "Add expense" stays normal unless user picks an outing
 */
export function getOutingCandidatesForTransaction(
  transaction: Transaction,
  outings: Outing[],
  expenses: OutingExpense[],
  timeZone?: string,
) {
  if (transaction.type !== "expense") return [];
  // Not a confirmed payment: never trip spend — also not for a row already
  // tagged with an outing (a payment reversed after it was linked must not
  // get its trip expense back).
  if (!isOutingSpendStatus(transaction)) return [];
  // Transfers / settlements are not trip spends.
  const cat = (transaction.category ?? "").toLowerCase();
  if (cat === "settlements" || cat === "transfer") return [];
  if ((transaction.tags ?? []).includes("outing-rollup")) return [];

  const linkedIds = new Set(
    expenses
      .map((expense) => expense.linkedTransactionId)
      .filter(Boolean) as string[],
  );
  if (linkedIds.has(transaction.id)) return [];

  // Already tagged by user/SMS — ensure outing expense exists for that outing.
  if (transaction.outingId) {
    const tagged = outings.find((o) => o.id === transaction.outingId);
    return tagged ? [tagged] : [];
  }

  // User explicitly unlinked — do not auto-reattach.
  if (hasOutingUnlinkedOptOut(transaction)) return [];

  // Manual ledger rows must stay "normal" unless the user picks an outing.
  if (!isBankLikeTransactionSource(transaction)) return [];

  const date = transaction.transactionDate ?? transaction.date ?? "";

  return outings.filter(
    (outing) =>
      outing.status === "active" &&
      !outing.isQuickSplit &&
      outingAutoAddEnabled(outing) &&
      isWithinOutingWindow(outing, date, timeZone),
  );
}

export function buildOutingExpenseFromTransaction(
  outing: Outing,
  transaction: Transaction,
) {
  const payer =
    outing.members.find((member) => member.isCurrentUser) ??
    outing.members[0];
  if (!payer) return null;

  const amount = Number(transaction.totalAmount ?? transaction.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const splits = buildExpenseSplits(
    amount,
    "equally",
    outing.members,
    payer.id,
    outing.members.map((member) => member.id),
  );

  const isBankLike =
    transaction.source === "mobile" ||
    transaction.source === "bank-sync" ||
    transaction.source === "import";

  return {
    outingId: outing.id,
    description: transaction.merchant,
    amount,
    category: transaction.category,
    date: (transaction.transactionDate ?? transaction.date ?? "").slice(0, 10),
    paidByMemberId: payer.id,
    splitType: "equally" as const,
    splits,
    source: (isBankLike ? "bank-detected" : "manual") as
      | "bank-detected"
      | "manual",
    linkedTransactionId: transaction.id,
    accountName:
      transaction.accountName || transaction.account || undefined,
    paymentMode: transaction.paymentMethod || transaction.paymentType || undefined,
  };
}
