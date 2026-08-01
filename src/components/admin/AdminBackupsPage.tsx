"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, DatabaseBackup } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminCountTable,
  adminListTable,
  adminListUsers,
  adminLogAction,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/admin-format";

const PAGE_SIZE = 50;

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Thin, purpose-built view over the same admin_list_table RPC the Database
// Viewer uses — a second presentation, not a second data-access path.
export function AdminBackupsPage() {
  const [page, setPage] = useState(0);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    adminLogAction({ action: "view_table", table: "backup_history" }).catch(() =>
      console.error("Failed to log view_table for backup_history"),
    );
  }, []);

  const { data: backups, isLoading } = useQuery({
    queryKey: ["admin-backups", page],
    queryFn: () =>
      adminListTable({
        table: "backup_history",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderDir: "desc",
      }),
    placeholderData: keepPreviousData,
  });

  const { data: totalCount } = useQuery({
    queryKey: ["admin-backups-count"],
    queryFn: () => adminCountTable("backup_history"),
  });

  // Email lookup for the user column (first 200 users covers this app's
  // scale; unknown ids fall back to the raw uuid, still linked).
  const { data: userRows } = useQuery({
    queryKey: ["admin-backup-user-map"],
    queryFn: () => adminListUsers({ limit: 200 }),
  });

  const emailById = useMemo(() => {
    const map = new Map<string, string>();
    (userRows ?? []).forEach((user) => map.set(user.id, user.email));
    return map;
  }, [userRows]);

  const failures = useMemo(
    () => (backups ?? []).filter((row) => row.status === "failed"),
    [backups],
  );

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  const renderTable = (rows: NonNullable<typeof backups>) => (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 font-semibold">When</th>
            <th className="px-4 py-2.5 font-semibold">User</th>
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Size</th>
            <th className="px-4 py-2.5 font-semibold">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const userId = String(row.user_id ?? "");
            return (
              <tr
                key={String(row.id)}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {row.created_at
                    ? formatIST(String(row.created_at))
                    : "—"}
                </td>
                <td className="max-w-[200px] truncate px-4 py-2.5">
                  <Link className="hover:underline" href={`/admin/users/${userId}`}>
                    {emailById.get(userId) ?? userId.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {String(row.type ?? "—")}
                  {row.frequency ? ` · ${row.frequency}` : ""}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      row.status === "failed"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {String(row.status)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {formatBytes(row.size_bytes as number | null)}
                </td>
                <td
                  className="max-w-[260px] truncate px-4 py-2.5 text-muted-foreground"
                  title={String(row.error_message ?? "")}
                >
                  {String(row.error_message ?? "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid gap-5">
      <p className="text-xs text-muted-foreground">
        Backup runs across all users, newest first. Many users failing at once
        usually means a systemic problem (a bug or a Storage issue), not
        individual bad luck.
      </p>

      {failures.length ? (
        <Card className="rounded-2xl border-rose-500/40 shadow-none">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-rose-500" />
              <h3 className="text-sm font-semibold">
                Failures on this page ({failures.length})
              </h3>
            </div>
            {renderTable(failures)}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <DatabaseBackup className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">All recent backups</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {totalCount ?? "…"} total
          </span>
        </div>
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : !backups?.length ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
            No backups recorded.
          </div>
        ) : (
          renderTable(backups)
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {page + 1} of {totalPages}
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
