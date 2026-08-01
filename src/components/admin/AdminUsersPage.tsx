"use client";

import { ChevronLeft, ChevronRight, Search, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminCountTable, adminListUsers } from "@/lib/admin-api";
import { formatCurrency } from "@/lib/utils";
import { formatISTDate } from "@/lib/admin-format";

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", appliedSearch, page],
    queryFn: () =>
      adminListUsers({
        search: appliedSearch || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const { data: totalUsers } = useQuery({
    queryKey: ["admin-users-count"],
    queryFn: () => adminCountTable("users"),
  });

  const totalPages = appliedSearch
    ? Math.max(1, page + 1 + (users && users.length === PAGE_SIZE ? 1 : 0))
    : Math.max(1, Math.ceil((totalUsers ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      {/* ── Search Bar Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-10 text-xs rounded-xl border-border/80 bg-card/60 backdrop-blur-sm"
            placeholder="Search users by name, email, or user id…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setAppliedSearch(search.trim());
                setPage(0);
              }
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-10 text-xs font-semibold rounded-xl px-4"
            variant="default"
            onClick={() => {
              setAppliedSearch(search.trim());
              setPage(0);
            }}
          >
            Search Directory
          </Button>
          {appliedSearch ? (
            <Button
              className="h-10 text-xs rounded-xl"
              variant="outline"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setPage(0);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !users?.length ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          <User className="size-8 text-muted-foreground/50 mb-2" />
          <p className="font-semibold text-foreground">No users found</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Try adjusting your search keywords.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card/40 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 font-bold text-foreground">User Profile</th>
                <th className="px-4 py-3 font-bold text-foreground">Access Role</th>
                <th className="px-4 py-3 font-bold text-foreground">Member Joined</th>
                <th className="px-4 py-3 text-right font-bold text-foreground">Transactions</th>
                <th className="px-4 py-3 text-right font-bold text-foreground">Month Spend</th>
                <th className="px-5 py-3 text-right font-bold text-foreground">Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const initial = (user.name || user.email || "U")[0].toUpperCase();
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link className="group flex items-center gap-3" href={`/admin/users/${user.id}`}>
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm ring-1 ring-primary/20">
                          {initial}
                        </div>
                        <div className="grid">
                          <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {user.name || "Unnamed User"}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {user.email}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {user.role === "admin" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          <ShieldCheck className="size-3.5" /> Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          User
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground font-mono">
                      {formatISTDate(user.joinedAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {user.txCount}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(user.monthSpend)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-primary">
                      {formatCurrency(user.totalSpend)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing page <strong className="text-foreground">{page + 1}</strong>
          {appliedSearch ? "" : ` of ${totalPages}`}
        </span>
        <div className="flex gap-1.5">
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
            disabled={(users?.length ?? 0) < PAGE_SIZE}
            size="icon-sm"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
