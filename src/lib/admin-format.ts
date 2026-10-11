// Shared admin-portal formatters.
//
// Timezone policy: created_at values are stored as timestamptz (UTC) — the
// correct storage form — and every admin view renders them pinned to IST
// (Asia/Kolkata) regardless of the viewing admin's own timezone. One
// formatter, used everywhere, so the policy can't drift per page.

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const istDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatIST(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${istDateTime.format(date)} IST`;
}

export function formatISTDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return istDate.format(date);
}

// Byte sizes: stored raw in the database (sortable/filterable), displayed as
// X.X KB below 1024 KB and X.X MB above. Single source of truth.
export function formatKb(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb.toFixed(1)} KB`;
}

/** True when the timestamp is in the future (e.g. auth banned_until). */
export function isInFuture(value: string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time > Date.now();
}
