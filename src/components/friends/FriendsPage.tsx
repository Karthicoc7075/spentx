"use client";

import { ArrowRight, Plus, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { fetchOutingExpenses, fetchOutingSettlements } from "@/lib/firebase";
import { computeMemberBalances } from "@/lib/outings";
import { formatCurrency } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useToast } from "@/providers/toast-provider";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const inlineInputClass =
  "h-9 rounded-lg border-transparent bg-transparent px-2.5 shadow-none transition-colors hover:border-input focus-visible:border-ring focus-visible:bg-background";

function friendInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function FriendsPage() {
  const { notify } = useToast();
  const { friends, isLoading, addFriend, updateFriend, removeFriend } =
    useFriends();
  const { outings } = useOutings();
  const { user } = useAuthReady();
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [phone, setPhone] = useState("");

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["allOutingExpenses", user?.id],
    queryFn: () => fetchOutingExpenses(user?.id),
  });
  const { data: allSettlements = [] } = useQuery({
    queryKey: ["allOutingSettlements", user?.id],
    queryFn: () => fetchOutingSettlements(user?.id),
  });

  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId);

  const friendBalance = useMemo(() => {
    if (!selectedFriend) return 0;
    let total = 0;
    for (const outing of outings) {
      const member = outing.members.find(
        (item) => item.friendId === selectedFriend.id,
      );
      if (!member) continue;
      const expenses = allExpenses.filter((item) => item.outingId === outing.id);
      const settlements = allSettlements.filter(
        (item) => item.outingId === outing.id,
      );
      const balance = computeMemberBalances(
        outing.members,
        expenses,
        settlements,
      ).find((item) => item.member.id === member.id)?.balance;
      total += balance ?? 0;
    }
    return total;
  }, [selectedFriend, outings, allExpenses, allSettlements]);

  const friendTrips = useMemo(() => {
    if (!selectedFriend) return [];
    return outings.filter((outing) =>
      outing.members.some((member) => member.friendId === selectedFriend.id),
    );
  }, [selectedFriend, outings]);

  async function handleAdd() {
    if (!name.trim()) {
      notify({ title: "Name required", description: "Enter a friend name." });
      return;
    }
    await addFriend({
      name: name.trim(),
      upiId: upiId || undefined,
      phone: phone || undefined,
    });
    notify({ title: "Friend added", description: name.trim() });
    setName("");
    setUpiId("");
    setPhone("");
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
      <div className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your friends directory with UPI IDs for quick settlements on
            shared trips.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground lg:self-end">
          <Users className="size-3.5" />
          {friends.length} friend{friends.length === 1 ? "" : "s"} saved
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid content-start gap-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Add friend
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Save a friend once, reuse across every outing.
                </p>
              </div>
              <Button onClick={() => void handleAdd()}>
                <Plus className="size-4" />
                Add friend
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  placeholder="Friend name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">UPI ID</Label>
                <Input
                  placeholder="name@upi"
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  placeholder="+91..."
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Friends directory
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click a row to see trips and balances. Edit fields inline.
                </p>
              </div>
            </div>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="h-11 px-4 text-xs font-medium text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                    UPI ID
                  </TableHead>
                  <TableHead className="h-11 text-xs font-medium text-muted-foreground">
                    Phone
                  </TableHead>
                  <TableHead className="h-11 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {friends.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-12 text-center text-sm text-muted-foreground"
                      colSpan={4}
                    >
                      No friends added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  friends.map((friend) => (
                    <TableRow
                      key={friend.id}
                      className={cn(
                        "cursor-pointer border-border/60 hover:bg-muted/40",
                        selectedFriendId === friend.id && "bg-accent/40",
                      )}
                      onClick={() => setSelectedFriendId(friend.id)}
                    >
                      <TableCell className="px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold text-foreground">
                            {friendInitials(friend.name)}
                          </div>
                          <Input
                            className={inlineInputClass}
                            value={friend.name}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              void updateFriend({
                                ...friend,
                                name: event.target.value,
                              })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          className={inlineInputClass}
                          placeholder="name@upi"
                          value={friend.upiId ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            void updateFriend({
                              ...friend,
                              upiId: event.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={inlineInputClass}
                          placeholder="+91..."
                          value={friend.phone ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            void updateFriend({
                              ...friend,
                              phone: event.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeFriend(friend.id);
                            notify({ title: "Friend removed" });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-border bg-card">
          <div className="px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight">
              Friend detail
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Trip history and settlement balance.
            </p>
          </div>
          <div className="border-t border-border/60 p-6">
            {!selectedFriend ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-muted/40 px-6 py-14 text-center">
                <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <UserRound className="size-5" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Select a friend to view trip history and settlement balance.
                </p>
              </div>
            ) : (
              <div className="grid gap-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    {friendInitials(selectedFriend.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold tracking-tight">
                      {selectedFriend.name}
                    </p>
                    {selectedFriend.upiId ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedFriend.upiId}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl bg-muted/50 px-4 py-3.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Net balance across trips
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <p className="text-2xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(Math.abs(friendBalance))}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        friendBalance >= 0
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                      )}
                    >
                      {friendBalance >= 0 ? "owes you" : "you owe"}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2.5 text-sm font-semibold">Shared trips</p>
                  {friendTrips.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No shared trips yet.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {friendTrips.map((trip) => (
                        <Link
                          key={trip.id}
                          className="group flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-3 transition-colors hover:bg-muted"
                          href={`/outings/${trip.id}`}
                        >
                          <span className="truncate text-sm font-medium">
                            {trip.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                                trip.status === "active"
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-muted-foreground/10 text-muted-foreground",
                              )}
                            >
                              {trip.status}
                            </span>
                            <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
