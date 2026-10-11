"use client";

import { Download, Eye, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
  downloadCsv,
  useDebouncedValue,
} from "@/components/admin/admin-ui";
import {
  adminCountActionLogs,
  adminListActionLogs,
  adminLogAction,
  type AdminActionLog,
  type AdminRow,
} from "@/lib/admin-api";
import { formatIST } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;

const ACTIONS = [
  "view_table", "view_row", "create", "update", "delete", "soft_delete", "restore", "export",
  "password_reset", "resend_verification", "force_verify_email", "suspend", "unsuspend",
  "impersonate_start", "impersonate_end", "impersonate_view", "settings_update", "rule_update",
  "purge_logs", "reset_all",
] as const;

const tone = (action: string): "muted" | "success" | "warning" | "danger" | "info" => {
  if (["delete", "soft_delete", "suspend", "reset_all", "purge_logs"].includes(action)) return "danger";
  if (["create", "restore", "unsuspend"].includes(action)) return "success";
  if (["update", "settings_update", "rule_update", "force_verify_email"].includes(action)) return "warning";
  if (action.startsWith("impersonate")) return "info";
  return "muted";
};

const selectClass =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/** IST date input (YYYY-MM-DD) -> ISO bound. */
function istBound(date: string, end: boolean) {
  if (!date) return null;
  return new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}+05:30`).toISOString();
}

export function AdminLogsPage() {
  const params = useSearchParams();
  const { notify } = useToast();
  const [action, setAction] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [targetUserId, setTargetUserId] = useState<string | null>(params.get("target"));
  const [sessionId, setSessionId] = useState<string | null>(params.get("session"));
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AdminActionLog | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const filters = {
    action: action || null,
    search: debouncedSearch || null,
    from: istBound(from, false),
    to: istBound(to, true),
    targetUserId,
    impersonationSessionId: sessionId,
  };

  const logsQuery = useQuery({
    queryKey: ["admin-action-logs", filters, page],
    queryFn: () => adminListActionLogs({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const countQuery = useQuery({
    queryKey: ["admin-action-logs-count", filters],
    queryFn: () => adminCountActionLogs(filters),
  });

  const logs = logsQuery.data ?? [];
  const resetPage = () => setPage(0);

  const exportCsv = async () => {
    downloadCsv(
      `spentx-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      logs.map((log) => ({
        created_at_ist: formatIST(log.created_at),
        admin: log.admin_email ?? log.admin_id,
        action: log.action,
        table: log.table_name,
        record_id: log.record_id,
        target: log.target_email ?? log.target_user_id,
        reason: log.reason,
        impersonation_session_id: log.impersonation_session_id,
        before: log.before,
        after: log.after,
      })),
    );
    try {
      await adminLogAction({ action: "export", table: "admin_action_logs" });
    } catch {
      notify({ title: "Exported", description: "Could not record the export in the audit log." });
    }
  };

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Audit log"
        description="Append-only record of admin actions, with before/after values for changes. Times are IST."
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!logs.length}>
            <Download className="size-3.5" /> Export page (CSV)
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder="Search admin, target, table, record id, reason…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
          />
        </div>
        <select
          className={selectClass}
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            resetPage();
          }}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="h-9 text-xs"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            resetPage();
          }}
          aria-label="From date (IST)"
        />
        <Input
          type="date"
          className="h-9 text-xs"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            resetPage();
          }}
          aria-label="To date (IST)"
        />
      </div>

      {targetUserId || sessionId ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {targetUserId ? (
            <FilterChip label={`Target user ${targetUserId.slice(0, 8)}…`} onClear={() => { setTargetUserId(null); resetPage(); }} />
          ) : null}
          {sessionId ? (
            <FilterChip label={`Impersonation session ${sessionId.slice(0, 8)}…`} onClear={() => { setSessionId(null); resetPage(); }} />
          ) : null}
        </div>
      ) : null}

      {logsQuery.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : logsQuery.error ? (
        <AdminErrorState error={logsQuery.error} onRetry={() => logsQuery.refetch()} />
      ) : !logs.length ? (
        <AdminEmptyState title="No matching audit entries" description="Change the filters or date range." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">When (IST)</th>
                <th className="px-3 py-2.5 font-semibold">Admin</th>
                <th className="px-3 py-2.5 font-semibold">Action</th>
                <th className="px-3 py-2.5 font-semibold">Table / record</th>
                <th className="px-3 py-2.5 font-semibold">Target user</th>
                <th className="px-3 py-2.5 font-semibold">Reason</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{formatIST(log.created_at)}</td>
                  <td className="px-3 py-2">{log.admin_name ?? log.admin_email ?? log.admin_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={tone(log.action)}>{log.action.replace(/_/g, " ")}</StatusPill>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 font-mono text-muted-foreground">
                    <span className="block truncate">
                      {log.table_name ?? "—"}
                      {log.record_id ? ` · ${log.record_id}` : ""}
                    </span>
                    {log.impersonation_session_id ? (
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => {
                          setSessionId(log.impersonation_session_id);
                          setAction("");
                          resetPage();
                        }}
                      >
                        session timeline
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {log.target_user_id ? (
                      <Link className="hover:underline" href={`/admin/users/${log.target_user_id}`}>
                        {log.target_name ?? log.target_email ?? log.target_user_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground" title={log.reason ?? undefined}>
                    {log.reason ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    {log.before || log.after ? (
                      <Button aria-label="View changes" size="icon-sm" variant="ghost" onClick={() => setDetail(log)}>
                        <Eye className="size-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={countQuery.data} onPageChange={setPage} loading={logsQuery.isFetching} />

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {detail?.action.replace(/_/g, " ")} — {detail?.table_name ?? ""}
            </SheetTitle>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{detail?.record_id}</p>
          </SheetHeader>
          {detail ? <ChangeDiff before={detail.before} after={detail.after ?? null} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1">
      {label}
      <button type="button" aria-label="Clear filter" onClick={onClear} className="text-muted-foreground hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  );
}

function fmt(value: unknown) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Field-level diff: changed fields first; unchanged collapsed. */
export function ChangeDiff({ before, after }: { before: AdminRow | null; after: AdminRow | null }) {
  const rows = useMemo(() => {
    const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])).sort();
    return keys.map((key) => {
      const b = before ? before[key] : undefined;
      const a = after ? after[key] : undefined;
      return { key, b, a, changed: Boolean(before && after) && JSON.stringify(a) !== JSON.stringify(b) };
    });
  }, [before, after]);
  const [showAll, setShowAll] = useState(false);
  const bothSides = Boolean(before && after);
  const visible = bothSides && !showAll ? rows.filter((row) => row.changed) : rows;

  return (
    <div className="grid gap-2 px-4 pb-6 text-xs">
      {bothSides ? (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{rows.filter((row) => row.changed).length} field(s) changed</span>
          <Button size="xs" variant="ghost" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Only changes" : "Show all fields"}
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">{before ? "Row before the action" : "Row after the action"}</span>
      )}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-1/4 px-2 py-1.5 font-semibold">Field</th>
              {before ? <th className="px-2 py-1.5 font-semibold">Before</th> : null}
              {after ? <th className="px-2 py-1.5 font-semibold">After</th> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className={cn("border-b border-border/60 align-top last:border-0", row.changed && "bg-amber-500/5")}>
                <td className="break-all px-2 py-1.5 font-mono">{row.key}</td>
                {before ? (
                  <td className={cn("break-all px-2 py-1.5 font-mono", row.changed && "text-destructive line-through decoration-destructive/40")}>
                    {fmt(row.b)}
                  </td>
                ) : null}
                {after ? (
                  <td className={cn("break-all px-2 py-1.5 font-mono", row.changed && "text-emerald-700 dark:text-emerald-300")}>
                    {fmt(row.a)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
