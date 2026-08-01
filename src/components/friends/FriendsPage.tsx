"use client";

import { ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFriends } from "@/hooks/useFriends";
import { useOutings } from "@/hooks/useOutings";
import {
  fetchOutingExpenses,
  fetchOutingSettlements,
  normalizeFriendUpis,
} from "@/lib/supabase-data";
import { computeNetBalancesByMember } from "@/lib/outings";
import {
  computeFriendSplitNetBalances,
  mergeNetBalances,
} from "@/lib/friend-splits";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { friendOwesYou, youOweFriend } from "@/lib/settlements";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import {
  FriendFormDialog,
  type FriendFormValues,
} from "@/components/friends/FriendFormDialog";
import { formatCurrency } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useToast } from "@/providers/toast-provider";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { Friend } from "@/types";

function friendInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function friendUpiList(friend: Friend): string[] {
  return normalizeFriendUpis(friend).upiIds;
}

export function FriendsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { friends, isLoading, addFriend, updateFriend, removeFriend } =
    useFriends();
  const { outings } = useOutings();
  const { splits: friendSplits, settlements: friendSettlements } =
    useFriendSplits();
  const { user } = useAuthReady();
  const [search, setSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Friend | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // null = Add mode; a Friend = Edit mode.
  const [editTarget, setEditTarget] = useState<Friend | null>(null);

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await removeFriend(target.id);
      notify({ title: "Friend deleted successfully." });
    } catch (error) {
      notify({
        title: "Couldn't delete friend",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["allOutingExpenses", user?.id],
    queryFn: () => fetchOutingExpenses(user?.id),
  });
  const { data: allSettlements = [] } = useQuery({
    queryKey: ["allOutingSettlements", user?.id],
    queryFn: () => fetchOutingSettlements(user?.id),
  });

  // A friend's balance spans both trips and one-off friend splits.
  const netBalancesByMember = useMemo(
    () =>
      mergeNetBalances(
        computeNetBalancesByMember(outings, allExpenses, allSettlements),
        computeFriendSplitNetBalances(friendSplits, friendSettlements),
      ),
    [outings, allExpenses, allSettlements, friendSplits, friendSettlements],
  );

  /**
   * Split into what you owe vs what you're owed — hidden entirely when both
   * are zero. A member's balance is what they paid minus their share, so a
   * NEGATIVE friend balance means the friend owes you (see lib/settlements).
   */
  const { youOwe, youAreOwed } = useMemo(() => {
    let owe = 0;
    let owed = 0;
    for (const item of netBalancesByMember) {
      if (friendOwesYou(item.balance)) owed += Math.abs(item.balance);
      else if (youOweFriend(item.balance)) owe += item.balance;
    }
    return { youOwe: owe, youAreOwed: owed };
  }, [netBalancesByMember]);

  const hasBalance = youOwe >= 0.01 || youAreOwed >= 0.01;

  const outingCountByFriend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const outing of outings) {
      for (const member of outing.members) {
        if (!member.friendId) continue;
        counts.set(member.friendId, (counts.get(member.friendId) ?? 0) + 1);
      }
    }
    return counts;
  }, [outings]);

  const visibleFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((friend) =>
      friend.name.toLowerCase().includes(query),
    );
  }, [friends, search]);

  function openAddFriend() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEditFriend(friend: Friend) {
    setEditTarget(friend);
    setFormOpen(true);
  }

  /** Errors propagate so the dialog can show them and stay open. */
  async function handleFriendSubmit(values: FriendFormValues) {
    if (editTarget) {
      await updateFriend({ ...editTarget, ...values });
      notify({ title: "Friend updated successfully." });
      return;
    }
    await addFriend(values);
    notify({ title: "Friend added successfully." });
  }

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage friends for split expenses and outings.
          </p>
        </div>
        <Button className="self-start sm:self-end" onClick={openAddFriend}>
          <Plus className="size-4" />
          Add Friend
        </Button>
      </div>

      {hasBalance ? (
        <div className="sx-surface flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Net balance
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">You owe: </span>
            <span className="font-semibold tabular-nums text-destructive">
              {formatCurrency(youOwe)}
            </span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">You are owed: </span>
            <span className="font-semibold tabular-nums text-success">
              {formatCurrency(youAreOwed)}
            </span>
          </p>
        </div>
      ) : null}

      <div className="grid content-start gap-6">
        <div className="sx-surface overflow-hidden">
          <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Friends list
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Click a row to see trips and balances.
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Search friends..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-11 px-4 text-xs font-medium text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                  Phone
                </TableHead>
                <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                  UPI IDs
                </TableHead>
                <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                  Outings
                </TableHead>
                <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                  Balance
                </TableHead>
                <TableHead className="h-11 w-24 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFriends.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-12 text-center text-sm text-muted-foreground"
                    colSpan={6}
                  >
                    {friends.length === 0
                      ? "No friends added yet."
                      : "No friends match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleFriends.map((friend) => {
                  const balance =
                    netBalancesByMember.find((item) => item.key === friend.id)
                      ?.balance ?? 0;
                  const outingCount = outingCountByFriend.get(friend.id) ?? 0;
                  const upiList = friendUpiList(friend);

                  return (
                    <TableRow
                      key={friend.id}
                      className="cursor-pointer border-border/60 hover:bg-muted/40"
                      onClick={() => router.push(`/friends/${friend.id}`)}
                    >
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold text-foreground">
                            {friendInitials(friend.name)}
                          </div>
                          <span className="font-medium">{friend.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {friend.phone || "—"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {upiList.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {upiList.map((upi) => (
                              <span
                                key={upi.toLowerCase()}
                                className="max-w-full truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium"
                              >
                                {upi}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {outingCount} outing{outingCount === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            Math.abs(balance) < 0.01
                              ? "bg-muted text-muted-foreground"
                              : friendOwesYou(balance)
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                          )}
                        >
                          {Math.abs(balance) < 0.01
                            ? "Settled"
                            : `${formatCurrency(Math.abs(balance))} ${
                                friendOwesYou(balance) ? "owes you" : "you owe"
                              }`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`View ${friend.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/friends/${friend.id}`);
                            }}
                          >
                            <ChevronRight className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${friend.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditFriend(friend);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete ${friend.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRemoveTarget(friend);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Remounted per open so the form always starts from fresh values. */}
      {formOpen ? (
        <FriendFormDialog
          key={editTarget?.id ?? "new"}
          open
          friend={editTarget}
          onOpenChange={setFormOpen}
          onSubmit={handleFriendSubmit}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(removeTarget)}
        itemLabel="Friend"
        description="Are you sure you want to delete this friend and all related split expenses, settlements and transactions?"
        detail={removeTarget?.name}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={() => void handleConfirmRemove()}
      />
    </div>
  );
}
