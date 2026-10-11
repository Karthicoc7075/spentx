"use client";

import { Download, Search, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
  downloadCsv,
  useDebouncedValue,
} from "@/components/admin/admin-ui";
import {
  adminCountApiLogs,
  adminListApiLogs,
  adminLogAction,
  adminPurgeApiLogs,
  type ApiLogFilters,
} from "@/lib/admin-api";
import { formatIST, formatKb } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;
const TYPES = ["rest_select", "rest_insert", "rest_update", "rest_delete", "rpc", "route_handler", "auth", "storage", "realtime"];

const selectClass =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function istBound(date: string, end: boolean) {
  if (!date) return null;
  return new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}+05:30`).toISOString();
}

export function AdminApiLogsPage() {
  const params = useSearchParams();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(params.get("user") ?? "");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [apiType, setApiType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const filters: ApiLogFilters = {
    emailSearch: debouncedSearch || null,
    actorRole: role || null,
    status: status || null,
    apiType: apiType || null,
    from: istBound(fromDate, false),
    to: istBound(toDate, true),
  };

  const logsQuery = useQuery({
    queryKey: ["admin-api-logs", filters, page],
    queryFn: () => adminListApiLogs(filters, PAGE_SIZE, page * PAGE_SIZE),
    placeholderData: keepPreviousData,
    // Live-refresh only the first page so paging doesn't shift under you.
    refetchInterval: page === 0 ? 30_000 : false,
  });
  const countQuery = useQuery({
    queryKey: ["admin-api-logs-count", filters],
    queryFn: () => adminCountApiLogs(filters),
  });
  const logs = logsQuery.data ?? [];

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="API logs"
        description="Calls captured by the server proxy (REST, RPC, auth, storage, route handlers). Times are IST. Retention 90 days."
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!logs.length}
              onClick={async () => {
                downloadCsv(`spentx-api-logs-${new Date().toISOString().slice(0, 10)}.csv`, logs.map((log) => ({ ...log, created_at_ist: formatIST(log.created_at) })));
                await adminLogAction({ action: "export", table: "user_api_logs" }).catch(() => {});
              }}
            >
              <Download className="size-3.5" /> Export page
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPurgeOpen(true)}>
              <Trash2 className="size-3.5" /> Purge old
            </Button>
          </>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(5,auto)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9 text-sm" placeholder="User email or name…" value={search} onChange={(event) => change(setSearch)(event.target.value)} />
        </div>
        <select className={selectClass} value={status} onChange={(event) => change(setStatus)(event.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
        </select>
        <select className={selectClass} value={role} onChange={(event) => change(setRole)(event.target.value)} aria-label="Actor role">
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="anonymous">Anonymous</option>
        </select>
        <select className={selectClass} value={apiType} onChange={(event) => change(setApiType)(event.target.value)} aria-label="API type">
          <option value="">All types</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <Input type="date" className="h-9 text-xs" value={fromDate} onChange={(event) => change(setFromDate)(event.target.value)} aria-label="From (IST)" />
        <Input type="date" className="h-9 text-xs" value={toDate} onChange={(event) => change(setToDate)(event.target.value)} aria-label="To (IST)" />
      </div>

      {logsQuery.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : logsQuery.error ? (
        <AdminErrorState error={logsQuery.error} onRetry={() => logsQuery.refetch()} migration="20260722 (API logs)" />
      ) : !logs.length ? (
        <AdminEmptyState title="No API calls match" description="Change the filters, or wait for users to use the app." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">When (IST)</th>
                <th className="px-3 py-2.5 font-semibold">Call</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 text-right font-semibold">Latency</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isError = log.status === "error";
                const open = expanded === log.id;
                return (
                  <tr
                    key={log.id}
                    className={cn("cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-muted/30", isError && "bg-destructive/5")}
                    onClick={() => setExpanded(open ? null : log.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{formatIST(log.created_at)}</td>
                    <td className="max-w-[280px] px-3 py-2">
                      <p className="truncate font-mono" title={log.api_name}>
                        {log.method ? `${log.method} ` : ""}
                        {log.api_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{log.api_type}</p>
                      {isError && log.error_message ? (
                        <p className={cn("text-[11px] text-destructive", open ? "whitespace-pre-wrap break-words" : "truncate")}>{log.error_message}</p>
                      ) : null}
                      {open ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          In {formatKb(log.request_size_bytes)} · Out {formatKb(log.response_size_bytes)}
                          {log.ip_address ? ` · IP ${log.ip_address}` : ""}
                          {log.user_agent ? ` · ${log.user_agent}` : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={isError ? "danger" : "success"}>
                        {log.status_code ?? ""} {log.status}
                      </StatusPill>
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <p className="truncate">{log.user_name ?? log.user_email ?? "Anonymous"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {log.actor_role}
                        {log.impersonated_by_admin_id ? " · impersonated" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[log.platform, log.device, log.os, log.browser].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{log.duration_ms != null ? `${log.duration_ms} ms` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={countQuery.data} onPageChange={setPage} loading={logsQuery.isFetching} />

      <AdminConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title="Purge API logs older than 30 days?"
        description="Deletes API log rows older than 30 days. This is recorded in the audit log."
        confirmLabel="Purge"
        destructive
        onConfirm={async () => {
          const removed = await adminPurgeApiLogs(30);
          await queryClient.invalidateQueries({ queryKey: ["admin-api-logs"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-api-logs-count"] });
          notify({ title: "Logs purged", description: `${removed.toLocaleString("en-IN")} rows removed.` });
        }}
      />
    </div>
  );
}
