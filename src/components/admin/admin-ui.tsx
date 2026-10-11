"use client";

/**
 * Shared admin building blocks so every admin page has the same header, error
 * state (with retry), empty state, pagination and confirmation dialog — all
 * on the website's existing theme tokens (globals.css), no bespoke colours.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, DatabaseZap, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isMissingMigrationError } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5", className)}>
      {children}
    </div>
  );
}

export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Real error state with retry. Detects "migration not applied" separately. */
export function AdminErrorState({
  error,
  onRetry,
  title,
  migration = "20261011_admin_fixes.sql",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  migration?: string;
}) {
  const missing = isMissingMigrationError(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
    >
      {missing ? (
        <DatabaseZap className="size-8 text-destructive" />
      ) : (
        <AlertTriangle className="size-8 text-destructive" />
      )}
      <div className="max-w-lg space-y-1">
        <p className="font-semibold text-foreground">
          {title ?? (missing ? "Database migration not applied" : "Could not load this data")}
        </p>
        <p className="break-words text-sm text-muted-foreground">
          {missing
            ? `Run supabase/migrations/${migration} in the Supabase SQL editor, then retry. (${errorMessage(error)})`
            : errorMessage(error)}
        </p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon ?? <Inbox className="size-7 text-muted-foreground" />}
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export function AdminLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading,
}: {
  page: number;
  pageSize: number;
  total: number | null | undefined;
  onPageChange: (page: number) => void;
  loading?: boolean;
}) {
  const pages = total ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = total == null ? (page + 1) * pageSize : Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {total == null ? `Rows ${from}–${to}` : `${from}–${to} of ${total.toLocaleString("en-IN")}`}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 0 || loading}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" /> Prev
        </Button>
        <span className="tabular-nums">
          Page {page + 1}
          {pages ? ` / ${pages}` : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || (pages != null && page + 1 >= pages)}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The one confirmation dialog for admin actions. Optional typed phrase for
 * destructive actions and optional reason field (sent to the audit log).
 */
export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  requirePhrase,
  reason,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** User must type this exactly to enable the confirm button. */
  requirePhrase?: string;
  /** Show a reason box; `minLength` > 0 makes it required. */
  reason?: { label?: string; minLength?: number; placeholder?: string };
  onConfirm: (input: { reason: string }) => Promise<void> | void;
  children?: ReactNode;
}) {
  const [phrase, setPhrase] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = !reason || reasonText.trim().length >= (reason.minLength ?? 0);
  const phraseOk = !requirePhrase || phrase.trim() === requirePhrase;

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setPhrase("");
      setReasonText("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: reasonText.trim() });
      setPhrase("");
      setReasonText("");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {reason ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">
              {reason.label ?? "Reason"}
              {reason.minLength ? <span className="text-destructive"> *</span> : null}
            </span>
            <Textarea
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder={reason.placeholder ?? "Why are you doing this? (saved to the audit log)"}
              rows={3}
            />
          </label>
        ) : null}
        {requirePhrase ? (
          <label className="grid gap-1.5 text-sm">
            <span>
              Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{requirePhrase}</code> to confirm
            </span>
            <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={submit}
            disabled={busy || !reasonOk || !phraseOk}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusPill({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const toneClass = {
    muted: "bg-muted text-muted-foreground border-border",
    success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
    info: "bg-primary/10 text-primary border-primary/20",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass)}>
      {children}
    </span>
  );
}

/** Debounced value for search boxes (no "press Enter to search" any more). */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: { key: K; dir: "asc" | "desc" } | null;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={cn("px-3 py-2.5 font-semibold text-foreground", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-primary">
        {label}
        <span className="text-[10px] text-muted-foreground">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

/** CSV download helper (client-side; values JSON-encoded when not scalar). */
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => {
    if (value == null) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
