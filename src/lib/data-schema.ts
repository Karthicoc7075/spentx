/** Postgres/Supabase schema helpers shared across the data layer. */

/** India Standard Time offset (no daylight saving). */
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * YYYY-MM-DD in India time. A bare date ("2026-11-01") is returned as is;
 * a timestamp is converted, so 00:30 IST on the 1st stays on the 1st.
 * Matches public.spentx_ist_month_key() and the mobile app.
 */
export function istCalendarDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return trimmed.slice(0, 10);
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM month key in India time (transactions.month_key). */
export function deriveMonthKey(date: string) {
  return istCalendarDate(date).slice(0, 7);
}

/** Start of an India calendar day as a timestamptz filter value. */
export function istDayStart(date: string) {
  return `${istCalendarDate(date)}T00:00:00+05:30`;
}

/** End of an India calendar day as a timestamptz filter value. */
export function istDayEnd(date: string) {
  return `${istCalendarDate(date)}T23:59:59.999+05:30`;
}
