"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  ScrollText,
  Activity,
  Smartphone,
  Layers,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListActionLogs, type AdminActionLog } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/admin-format";
import { AdminApiLogsPage } from "@/components/admin/AdminApiLogsPage";
import { AdminSmsRulesPage } from "@/components/admin/AdminSmsRulesPage";
import { AdminCategoriesPage } from "@/components/admin/AdminCategoriesPage";
import { AdminSettingsPage } from "@/components/admin/AdminSettingsPage";

const PAGE_SIZE = 50;

const subTabs = [
  { id: "audit", label: "Audit Logs", icon: ScrollText },
  { id: "api", label: "API Telemetry", icon: Activity },
  { id: "sms", label: "SMS Rules", icon: Smartphone },
  { id: "categories", label: "Categories", icon: Layers },
  { id: "settings", label: "Global Settings", icon: Settings },
];

const actionFilters = [
  { value: null, label: "All actions" },
  { value: "view_table", label: "Table views" },
  { value: "view_row", label: "User views" },
  { value: "create", label: "Creates" },
  { value: "update", label: "Updates" },
  { value: "delete", label: "Deletes" },
  { value: "password_reset", label: "Password resets" },
  { value: "impersonate_start", label: "Impersonation starts" },
  { value: "impersonate_end", label: "Impersonation ends" },
  { value: "export", label: "Exports" },
] as const;

const actionTone: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  update: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  delete: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  export: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  password_reset: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  view_row: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  view_table: "bg-muted text-muted-foreground",
  impersonate_start: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  impersonate_end: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function AdminLogsPage() {
  const [activeTab, setActiveTab] = useState<string>("audit");
  const [action, setAction] = useState<string | null>(null);
  const [targetFilter, setTargetFilter] = useState("");
  const [appliedTarget, setAppliedTarget] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AdminActionLog | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-action-logs", action, appliedTarget, sessionFilter, page],
    queryFn: () =>
      adminListActionLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action,
        targetUserId: appliedTarget,
        impersonationSessionId: sessionFilter,
      }),
    placeholderData: keepPreviousData,
    enabled: activeTab === "audit",
  });

  return (
    <div className="grid gap-6">
      {/* ── Sub Hub Tabs Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/40 p-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                  isTabActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Render Active Tab Content ── */}
      {activeTab === "api" ? (
        <AdminApiLogsPage />
      ) : activeTab === "sms" ? (
        <AdminSmsRulesPage />
      ) : activeTab === "categories" ? (
        <AdminCategoriesPage />
      ) : activeTab === "settings" ? (
        <AdminSettingsPage />
      ) : (
        /* ── Audit Logs View ── */
        <div className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            Append-only record of every admin action — table views, user detail
            views, deletions (with before-images), and exports. Immutable & security verified.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
              {actionFilters.map((filter) => (
                <button
                  key={filter.label}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                    action === filter.value &&
                      "bg-background font-semibold text-foreground shadow-sm",
                  )}
                  type="button"
                  onClick={() => {
                    setAction(filter.value);
                    setPage(0);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 gap-2">
              <Input
                className="h-9 min-w-40 flex-1 text-xs rounded-xl"
                placeholder="Filter by target user id…"
                value={targetFilter}
                onChange={(event) => setTargetFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setAppliedTarget(targetFilter.trim() || null);
                    setPage(0);
                  }
                }}
              />
              <Button
                className="h-9 text-xs rounded-xl"
                variant="outline"
                onClick={() => {
                  setAppliedTarget(targetFilter.trim() || null);
                  setPage(0);
                }}
              >
                Apply
              </Button>
            </div>
          </div>

          {sessionFilter ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs">
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                Impersonation session timeline:
              </span>
              <span className="truncate font-mono text-muted-foreground">{sessionFilter}</span>
              <Button
                className="ml-auto h-7 text-[11px] rounded-lg"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSessionFilter(null);
                  setPage(0);
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : !logs?.length ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              No admin actions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card/40">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 font-bold text-foreground">When</th>
                    <th className="px-4 py-3 font-bold text-foreground">Admin</th>
                    <th className="px-4 py-3 font-bold text-foreground">Action</th>
                    <th className="px-4 py-3 font-bold text-foreground">Table / record</th>
                    <th className="px-4 py-3 font-bold text-foreground">Target user</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground font-mono">
                        {formatIST(log.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-foreground">
                          {log.admin_name ?? log.admin_email ?? log.admin_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
                            actionTone[log.action] ?? "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground font-mono">
                        {log.table_name ?? "—"}
                        {log.record_id ? ` · ${log.record_id}` : ""}
                        {log.impersonation_session_id ? (
                          <button
                            className="ml-1.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
                            title={`Show this impersonation session's full timeline (${log.impersonation_session_id})`}
                            type="button"
                            onClick={() => {
                              setSessionFilter(log.impersonation_session_id);
                              setAction(null);
                              setPage(0);
                            }}
                          >
                            session
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {log.target_user_id ? (
                          <Link
                            className="hover:underline font-medium text-foreground"
                            href={`/admin/users/${log.target_user_id}`}
                          >
                            {log.target_name ?? log.target_email ?? log.target_user_id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {log.before ? (
                          <Button
                            aria-label="View before-image"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setDetail(log)}
                            className="rounded-lg"
                          >
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

          <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
            <span>Page {page + 1}</span>
            <div className="flex gap-1">
              <Button
                disabled={page === 0}
                size="icon-sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-xl"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                disabled={(logs?.length ?? 0) < PAGE_SIZE}
                size="icon-sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {detail ? (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs"
              onClick={() => setDetail(null)}
            >
              <div
                className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-background p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">
                    Before Image — {detail.table_name} · {detail.record_id}
                  </h3>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDetail(null)} className="rounded-lg">
                    <X className="size-4" />
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-2xl bg-muted p-4 text-[11px] font-mono leading-relaxed border border-border/80">
                  {JSON.stringify(detail.before, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
