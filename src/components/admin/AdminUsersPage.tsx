"use client";

import { Search, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
  useDebouncedValue,
} from "@/components/admin/admin-ui";
import { adminCountUsers, adminListUsers, type AdminUserSort } from "@/lib/admin-api";
import { formatIST, formatISTDate, isInFuture } from "@/lib/admin-format";
import { formatCurrency } from "@/lib/utils";

const PAGE_SIZE = 25;

const selectClass =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "admin" | "user">("");
  const [sort, setSort] = useState<AdminUserSort>("joined_desc");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim());

  const filters = { search: debouncedSearch || null, role: role || null };

  const usersQuery = useQuery({
    queryKey: ["admin-users", filters, sort, page],
    queryFn: () => adminListUsers({ ...filters, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const countQuery = useQuery({
    queryKey: ["admin-users-count", filters],
    queryFn: () => adminCountUsers(filters),
  });

  const users = usersQuery.data ?? [];

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Users"
        description="Spend = confirmed expenses, excluding transfers and outing roll-ups. Month uses IST."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder="Search name, email, phone or user id…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            aria-label="Search users"
          />
        </div>
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as typeof role);
              setPage(0);
            }}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
          </select>
          <select
            className={selectClass}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminUserSort);
              setPage(0);
            }}
            aria-label="Sort users"
          >
            <option value="joined_desc">Newest first</option>
            <option value="joined_asc">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="email_asc">Email A–Z</option>
          </select>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : usersQuery.error ? (
        <AdminErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
      ) : !users.length ? (
        <AdminEmptyState
          icon={<User className="size-7 text-muted-foreground" />}
          title="No users found"
          description={debouncedSearch || role ? "Try a different search or filter." : "Nobody has signed up yet."}
        />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Joined</th>
                  <th className="px-3 py-2.5 font-semibold">Last seen</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Txns</th>
                  <th className="px-3 py-2.5 text-right font-semibold">This month</th>
                  <th className="px-4 py-2.5 text-right font-semibold">All-time spend</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link className="group grid" href={`/admin/users/${user.id}`}>
                        <span className="font-medium text-foreground group-hover:text-primary">
                          {user.name || "Unnamed user"}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{user.email}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <UserStatusPills user={user} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatISTDate(user.joinedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {user.lastSeenAt || user.lastSignInAt ? formatIST(user.lastSeenAt ?? user.lastSignInAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{user.txCount}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(user.monthSpend)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(user.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className="grid gap-1.5 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{user.name || "Unnamed user"}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{user.email}</p>
                  </div>
                  <UserStatusPills user={user} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{user.txCount} txns · joined {formatISTDate(user.joinedAt)}</span>
                  <span className="font-medium text-foreground">{formatCurrency(user.monthSpend)} / mo</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <AdminPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={countQuery.data}
        onPageChange={setPage}
        loading={usersQuery.isFetching}
      />
    </div>
  );
}

function UserStatusPills({
  user,
}: {
  user: { role: string; emailConfirmed?: boolean; bannedUntil?: string | null };
}) {
  const banned = isInFuture(user.bannedUntil);
  return (
    <div className="flex flex-wrap gap-1">
      {user.role === "admin" ? (
        <StatusPill tone="warning">
          <ShieldCheck className="size-3" /> Admin
        </StatusPill>
      ) : null}
      {banned ? <StatusPill tone="danger">Suspended</StatusPill> : null}
      {user.emailConfirmed === false ? <StatusPill tone="muted">Unverified</StatusPill> : null}
      {user.role !== "admin" && !banned && user.emailConfirmed !== false ? (
        <StatusPill tone="success">Active</StatusPill>
      ) : null}
    </div>
  );
}
