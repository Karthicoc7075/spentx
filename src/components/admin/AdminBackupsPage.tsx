"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
} from "@/components/admin/admin-ui";
import { adminCountBackups, adminListBackups } from "@/lib/admin-api";
import { formatIST, formatKb } from "@/lib/admin-format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const FILTERS = [
  { value: "", label: "All" },
  { value: "success", label: "Successful" },
  { value: "failed", label: "Failed" },
];

// Server-side status filter + joined user email (admin_list_backups), so the
// "failed" view covers every backup, not just the current page, and emails
// resolve for any number of users.
export function AdminBackupsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(0);

  const listQuery = useQuery({
    queryKey: ["admin-backups", status, page],
    queryFn: () => adminListBackups({ status: status || null, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const countQuery = useQuery({
    queryKey: ["admin-backups-count", status],
    queryFn: () => adminCountBackups(status || null),
  });
  const rows = listQuery.data ?? [];

  return (
    <div className="grid gap-5">
      <AdminPageHeader title="Backups" description="Backup history from the mobile app and website, newest first. Times are IST." />

      <div className="flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => {
              setStatus(filter.value);
              setPage(0);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
              status === filter.value && "bg-background text-foreground shadow-sm",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {listQuery.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : listQuery.error ? (
        <AdminErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
      ) : !rows.length ? (
        <AdminEmptyState title={status === "failed" ? "No failed backups" : "No backups yet"} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">When (IST)</th>
                <th className="px-3 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Size</th>
                <th className="px-3 py-2.5 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const userId = String(row.user_id ?? "");
                const failed = row.status === "failed";
                return (
                  <tr key={String(row.id)} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {row.created_at ? formatIST(String(row.created_at)) : "—"}
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      {userId ? (
                        <Link className="block truncate hover:underline" href={`/admin/users/${userId}`}>
                          {String(row.user_email ?? row.user_name ?? userId.slice(0, 8))}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {String(row.type ?? "—")}
                      {row.frequency ? ` · ${String(row.frequency)}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={failed ? "danger" : "success"}>{String(row.status ?? "—")}</StatusPill>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {row.size_bytes != null ? formatKb(Number(row.size_bytes)) : "—"}
                    </td>
                    <td className="max-w-[260px] break-words px-3 py-2 text-destructive">
                      {row.error_message ? String(row.error_message) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={countQuery.data} onPageChange={setPage} loading={listQuery.isFetching} />
    </div>
  );
}
