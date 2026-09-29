"use client";

import { ArrowRight, Compass, Info, Map as MapIcon, MapPin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreateOutingModal } from "@/components/outings/CreateOutingModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useFriends } from "@/hooks/useFriends";
import { useOutings } from "@/hooks/useOutings";
import { usePurposes } from "@/hooks/usePurposes";
import { getDefaultPersonalPurpose } from "@/lib/purposes";
import {
  filterOutings,
  formatOutingDates,
  getOutingStatusLabel,
  isOutingActive,
  sortOutings,
  type OutingListFilter,
} from "@/lib/outing-display";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { Outing, OutingExpense, TripMember } from "@/types";

const statusTabs: Array<{ value: OutingListFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
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
  const { purposes } = usePurposes();
  const { friends } = useFriends();
  const { expenses: allExpenses, isLoading: expensesLoading } =
    useAllOutingExpenses();
  const [statusFilter, setStatusFilter] = useState<OutingListFilter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const activeOuting = useMemo(
    () => outings.find((o) => isOutingActive(o) && o.isActive !== false),
    [outings],
  );

  const expensesByOuting = useMemo(() => {
    const map = new Map<string, OutingExpense[]>();
    for (const expense of allExpenses) {
      const current = map.get(expense.outingId) ?? [];
      current.push(expense);
      map.set(expense.outingId, current);
    }
    return map;
  }, [allExpenses]);

  const tabCounts = useMemo(() => {
    return {
      all: filterOutings(outings, "all", "").length,
      active: filterOutings(outings, "active", "").length,
      planned: filterOutings(outings, "planned", "").length,
      completed: filterOutings(outings, "completed", "").length,
      archived: filterOutings(outings, "archived", "").length,
    };
  }, [outings]);

  const filteredOutings = useMemo(() => {
    const filtered = filterOutings(outings, statusFilter, search);
    return sortOutings(filtered, (outingId) => {
      const expenses = expensesByOuting.get(outingId) ?? [];
      return expenses.reduce((sum, expense) => sum + expense.amount, 0);
    });
  }, [expensesByOuting, outings, statusFilter, search]);

  function outingTotal(outingId: string) {
    const expenses = expensesByOuting.get(outingId) ?? [];
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }

  async function handleCreate(
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    if (activeOuting) {
      notify({
        title: "Outing already active",
        description: `End “${activeOuting.name}” before starting a new trip.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const created = (await addOuting(outing)) as Outing | undefined;
      notify({
        title: "Outing created",
        description: `${outing.name} is active — add expenses or let mobile SMS detect during the trip dates.`,
      });
      if (created?.id) {
        router.push(`/outings/${created.id}`);
      }
    } catch (error) {
      notify({
        title: "Couldn't create outing",
        description:
          error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  }

  const loading = isLoading || expensesLoading;

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Outings & Trips
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One active trip at a time. Mobile SMS auto-detect can link spends during the trip dates.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
          <Button
            className="gap-2"
            disabled={Boolean(activeOuting)}
            title={
              activeOuting
                ? "Only one active outing allowed at a time"
                : "Create a new outing"
            }
            onClick={() => {
              if (activeOuting) return;
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create Outing
          </Button>
          {activeOuting ? (
            <p className="text-xs text-muted-foreground max-w-xs sm:text-right flex items-center gap-1.5">
              <Info className="size-3.5 shrink-0 text-muted-foreground" />
              <span>You already have an active outing. Complete it before creating another.</span>
            </p>
          ) : null}
        </div>
      </div>

      {activeOuting ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Compass className="size-3.5" />
              Active Outing
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Active
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{activeOuting.name}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                {activeOuting.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {activeOuting.location}
                  </span>
                ) : null}
                <span>{formatOutingDates(activeOuting)}</span>
                <span>· {activeOuting.members.length} members</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Total Spent</p>
                <p className="text-base font-bold text-foreground tabular-nums">
                  {formatCurrency(outingTotal(activeOuting.id))}
                </p>
              </div>
              <Button
                className="gap-1.5"
                onClick={() => router.push(`/outings/${activeOuting.id}`)}
              >
                Manage Outing
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap items-center rounded-xl bg-muted/60 p-1 border border-border/40">
          {statusTabs
            .filter((tab) => tab.value !== "planned" || tabCounts.planned > 0)
            .map((tab) => (
              <button
                key={tab.value}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === tab.value
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label} ({tabCounts[tab.value]})
              </button>
            ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-xl pl-9 text-sm"
            placeholder="Search trips, location, category..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : filteredOutings.length === 0 ? (
        <div className="sx-surface flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MapIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {search ? "No outings match your search" : "No outings yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try adjusting your search terms or filter."
              : "Create your first trip to start splitting expenses."}
          </p>
          <Button
            className="mt-5"
            disabled={Boolean(activeOuting)}
            onClick={() => {
              if (activeOuting) {
                notify({
                  title: "Outing already active",
                  description: `End “${activeOuting.name}” before starting a new trip.`,
                  variant: "destructive",
                });
                return;
              }
              setCreateOpen(true);
            }}
          >
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
            const outingPurpose = outing.purposeId
              ? purposes.find((p) => p.id === outing.purposeId) ??
                purposes.find(
                  (p) => p.name.toLowerCase() === outing.purposeId?.toLowerCase(),
                ) ??
                getDefaultPersonalPurpose(purposes)
              : getDefaultPersonalPurpose(purposes);

            return (
              <Link
                key={outing.id}
                className="group flex flex-col justify-between gap-5 sx-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                href={`/outings/${outing.id}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(() => {
                        const statusLabel = getOutingStatusLabel(outing);
                        return (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize",
                              statusLabel === "Active"
                                ? "bg-accent text-accent-foreground"
                                : statusLabel === "Completed"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                  : statusLabel === "Planned"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                            )}
                          >
                            {statusLabel}
                          </span>
                        );
                      })()}
                      {outingPurpose ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: outingPurpose.color ? `${outingPurpose.color}40` : undefined,
                            color: outingPurpose.color,
                            backgroundColor: outingPurpose.color ? `${outingPurpose.color}15` : undefined,
                          }}
                        >
                          {outingPurpose.name}
                        </span>
                      ) : null}
                    </div>
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
