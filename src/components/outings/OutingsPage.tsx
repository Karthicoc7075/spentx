"use client";

import { ArrowRight, Map as MapIcon, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreateOutingModal } from "@/components/outings/CreateOutingModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useFriends } from "@/hooks/useFriends";
import { useOutings } from "@/hooks/useOutings";
import {
  filterOutings,
  formatOutingDates,
  getOutingStatusLabel,
  sortOutings,
  type OutingListFilter,
} from "@/lib/outing-display";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { Outing, OutingExpense, TripMember } from "@/types";

const statusTabs: Array<{ value: OutingListFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

function memberInitials(member: TripMember) {
  const parts = member.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function OutingsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { outings, isLoading, addOuting } = useOutings();
  const { friends } = useFriends();
  const { expenses: allExpenses, isLoading: expensesLoading } =
    useAllOutingExpenses();
  const [statusFilter, setStatusFilter] = useState<OutingListFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const expensesByOuting = useMemo(() => {
    const map = new Map<string, OutingExpense[]>();
    for (const expense of allExpenses) {
      const current = map.get(expense.outingId) ?? [];
      current.push(expense);
      map.set(expense.outingId, current);
    }
    return map;
  }, [allExpenses]);

  const filteredOutings = useMemo(() => {
    const filtered = filterOutings(outings, statusFilter, "");
    return sortOutings(filtered, (outingId) => {
      const expenses = expensesByOuting.get(outingId) ?? [];
      return expenses.reduce((sum, expense) => sum + expense.amount, 0);
    });
  }, [expensesByOuting, outings, statusFilter]);

  function outingTotal(outingId: string) {
    const expenses = expensesByOuting.get(outingId) ?? [];
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }

  async function handleCreate(
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const created = (await addOuting(outing)) as Outing | undefined;
    notify({
      title: "Outing created",
      description: `${outing.name} is ready for expenses.`,
    });
    if (created?.id) {
      router.push(`/outings/${created.id}`);
    }
  }

  const loading = isLoading || expensesLoading;

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Outings & Trips
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track shared trips, events, and group expenses with friends.
          </p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New trip
        </Button>
      </div>

      <div className="inline-flex w-fit items-center rounded-full bg-muted p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              statusFilter === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : filteredOutings.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MapIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">No outings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first trip to start splitting expenses.
          </p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New trip
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOutings.map((outing) => {
            const total = outingTotal(outing.id);
            const visibleMembers = outing.members.slice(0, 4);
            const extraMembers = outing.members.length - visibleMembers.length;

            return (
              <Link
                key={outing.id}
                className="group flex flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                href={`/outings/${outing.id}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize",
                        outing.status === "active"
                          ? "bg-accent text-accent-foreground"
                          : outing.status === "completed"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                      )}
                    >
                      {getOutingStatusLabel(outing)}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <h3 className="mt-3 truncate text-base font-semibold tracking-tight">
                    {outing.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    {outing.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {outing.location}
                      </span>
                    ) : null}
                    <span>{formatOutingDates(outing) || "No dates"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      {visibleMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-accent text-[9px] font-bold text-accent-foreground"
                          title={member.name}
                        >
                          {memberInitials(member)}
                        </div>
                      ))}
                      {extraMembers > 0 ? (
                        <div className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-bold text-muted-foreground">
                          +{extraMembers}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Total spent
                    </p>
                    <p className="text-sm font-bold tracking-tight tabular-nums">
                      {formatCurrency(total)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CreateOutingModal
        friends={friends}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
