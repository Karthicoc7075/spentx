/** Postgres/Supabase schema helpers shared across the data layer. */

export function deriveMonthKey(date: string) {
  return date.slice(0, 7);
}