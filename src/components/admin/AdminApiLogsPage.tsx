"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Database,
  KeyRound,
  Radio,
  Search,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminCountApiLogs,
  adminListApiLogs,
  type ApiLogFilters,
  type UserApiLog,
} from "@/lib/admin-api";
import { formatIST, formatKb } from "@/lib/admin-format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const apiTypeIcons: Record<string, LucideIcon> = {
  rest_select: Database,
  rest_insert: Database,
  rest_update: Database,
  rest_delete: Database,
  rpc: Zap,
  route_handler: Server,
  auth: KeyRound,
  storage: Server,
  realtime: Radio,
};

const roleOptions = ["", "user", "admin", "anonymous"] as const;
const statusOptions = ["", "success", "error"] as const;
const typeOptions = [
  "",
  "rest_select",
  "rest_insert",
  "rest_update",
  "rest_delete",
  "rpc",
  "route_handler",
  "auth",
  "storage",
  "realtime",
] as const;

function SelectPills<T extends string>({
  options,
  value,
  allLabel,
  onChange,
}: {
  options: readonly T[];
  value: T;
  allLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
      {options.map((option) => (
        <button
          key={option || "all"}
          className={cn(
            "rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === option && "bg-background font-semibold text-foreground shadow-sm",
          )}
          type="button"
          onClick={() => onChange(option)}
        >
          {option || allLabel}
        </button>
      ))}
    </div>
  );
}

export function AdminApiLogsPage() {
  const [emailInput, setEmailInput] = useState("");
  const [filters, setFilters] = useState<ApiLogFilters>({});
  const [role, setRole] = useState<(typeof roleOptions)[number]>("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("");
  const [apiType, setApiType] = useState<(typeof typeOptions)[number]>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const applyFilters = () => {
    setFilters({
      emailSearch: emailInput.trim() || null,
      actorRole: role || null,
      status: status || null,
      apiType: apiType || null,
      // Date inputs are naive local dates; treat them as IST day boundaries.
      from: fromDate ? new Date(`${fromDate}T00:00:00+05:30`).toISOString() : null,
      to: toDate ? new Date(`${toDate}T23:59:59.999+05:30`).toISOString() : null,
    });
    setPage(0);
  };

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-api-logs", filters, page],
    queryFn: () => adminListApiLogs(filters, PAGE_SIZE, page * PAGE_SIZE),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const { data: totalCount } = useQuery({
    queryKey: ["admin-api-logs-count", filters],
    queryFn: () => adminCountApiLogs(filters),
  });

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  const renderCard = (log: UserApiLog) => {
    const Icon = apiTypeIcons[log.api_type] ?? Activity;
    const isError = log.status === "error";
    return (
      <div
        key={log.id}
        className={cn(
          "flex flex-col rounded-2xl border p-4 shadow-xs transition-all hover:border-primary/50 hover:shadow-sm",
          isError
            ? "border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10"
            : "border-border/80 bg-card/60 dark:bg-card/40",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs",
                isError
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : "bg-primary/10 text-primary ring-1 ring-primary/20",
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground" title={log.api_name}>
                {log.api_name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">
                  {log.api_type} {log.method ? `· ${log.method}` : ""}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold border",
                    isError
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                  )}
                >
                  {log.status_code ? `${log.status_code} ` : ""}{log.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isError && log.error_message ? (
          <p
            className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[11px] font-mono leading-relaxed text-rose-600 dark:text-rose-400"
            title={log.error_message}
          >
            {log.error_message.length > 160
              ? `${log.error_message.slice(0, 160)}…`
              : log.error_message}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs border-t border-border/60 pt-3">
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              User & Role
            </dt>
            <dd className="truncate font-medium text-foreground" title={log.user_email ?? undefined}>
              {log.user_name ?? log.user_email ?? "Anonymous"}
              <span
                className={cn(
                  "ml-1.5 text-[10px] font-bold uppercase",
                  log.actor_role === "admin" ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                ({log.actor_role})
              </span>
              {log.impersonated_by_admin_id ? (
                <span
                  className="ml-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-400"
                  title={`Performed by admin ${log.impersonated_by_admin_id} during an impersonation session`}
                >
                  impersonated
                </span>
              ) : null}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              IP Address
            </dt>
            <dd className="truncate font-mono font-semibold text-foreground">
              {log.ip_address || "127.0.0.1"}
            </dd>
          </div>

          <div className="min-w-0 col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Device, OS & Browser
            </dt>
            <dd className="truncate font-mono text-muted-foreground text-[11px]">
              {[log.device, log.os, log.browser].filter(Boolean).join(" · ") || "Web Browser / Desktop"}
            </dd>
          </div>

          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Payload Size
            </dt>
            <dd className="font-mono text-muted-foreground text-[11px]">
              In: {formatKb(log.request_size_bytes)} · Out: {formatKb(log.response_size_bytes)}
            </dd>
          </div>

          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Latency
            </dt>
            <dd className="font-mono font-semibold text-foreground">
              {log.duration_ms !== null ? `${log.duration_ms} ms` : "—"}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[11px] font-mono text-muted-foreground/80 border-t border-border/40 pt-2 flex items-center justify-between">
          <span>{formatIST(log.created_at)}</span>
          {log.platform ? (
            <span className="uppercase text-[10px] font-bold text-primary">{log.platform}</span>
          ) : null}
        </p>
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">
        Every API call from every user and admin — REST, RPC, auth, storage,
        route handlers, and realtime subscription starts — with real client
        IPs, captured by the server proxy. All times shown in IST. Retention:
        90 days.
      </p>

      {/* Filters */}
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-xs"
              placeholder="Search by user email or name…"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
            />
          </div>
          <Input
            className="h-9 w-36 text-xs"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <Input
            className="h-9 w-36 text-xs"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
          <Button className="h-9 text-xs" variant="outline" onClick={applyFilters}>
            Apply
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectPills allLabel="All roles" options={roleOptions} value={role} onChange={setRole} />
          <SelectPills allLabel="All statuses" options={statusOptions} value={status} onChange={setStatus} />
          <SelectPills allLabel="All types" options={typeOptions} value={apiType} onChange={setApiType} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : !logs?.length ? (
        <EmptyState
          description="Calls will appear here as users interact with the app. If this stays empty, confirm the 20260722 migration is applied."
          icon={Activity}
          title="No API calls logged yet"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {logs.map(renderCard)}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {page + 1} of {totalPages} · {totalCount ?? "…"} calls
        </span>
        <div className="flex gap-1">
          <Button
            disabled={page === 0}
            size="icon-sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            disabled={page + 1 >= totalPages}
            size="icon-sm"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

    </div>
  );
}
