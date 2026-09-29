"use client";

import { ArrowLeft, Copy, Pencil, Phone, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFriends } from "@/hooks/useFriends";
import { useOutings } from "@/hooks/useOutings";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useAllOutingSettlements } from "@/hooks/useAllOutingSettlements";
import { formatOutingDates } from "@/lib/outing-display";
import {
  computeMemberBalances,
  computeTripSummary,
  getCurrentUserMember,
} from "@/lib/outings";
import { normalizeFriendUpis } from "@/lib/supabase-data";
import { computeFriendSplitBalances } from "@/lib/friend-splits";
import {
  settlementDirection,
  settlementMerchant,
  type SettlementTarget,
} from "@/lib/settlements";
import { SettleUpDialog } from "@/components/friends/SettleUpDialog";
import {
  FriendFormDialog,
  type FriendFormValues,
} from "@/components/friends/FriendFormDialog";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { Friend } from "@/types";

type FriendDetailPageProps = {
  friend: Friend;
};

function friendInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function FriendDetailPage({ friend }: FriendDetailPageProps) {
  const router = useRouter();
  const { notify } = useToast();
  const { outings } = useOutings();
  const { updateFriend, removeFriend } = useFriends();
  const { splits: friendSplits, settlements: friendSettlements } =
    useFriendSplits();
  const { expenses: allExpenses } = useAllOutingExpenses();
  const { settlements: allSettlements } = useAllOutingSettlements();

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettlementTarget | null>(null);

  const upiList = useMemo(() => normalizeFriendUpis(friend).upiIds, [friend]);

  const friendTrips = useMemo(() => {
    return outings
      .filter((outing) => outing.members.some((member) => member.friendId === friend.id))
      .map((outing) => {
        const outingExpenses = allExpenses.filter((item) => item.outingId === outing.id);
        const outingSettlements = allSettlements.filter(
          (item) => item.outingId === outing.id,
        );
        const friendMember = outing.members.find((member) => member.friendId === friend.id);
        if (!friendMember) return null;

        const currentMember = getCurrentUserMember(outing.members);

        const balances = computeMemberBalances(outing.members, outingExpenses, outingSettlements);
        const balance = balances.find((item) => item.member.id === friendMember.id)?.balance ?? 0;
        const summary = computeTripSummary(outing, outingExpenses, outingSettlements);

        return {
          outing,
          friendMember,
          currentMember,
          balance,
          totalSpent: summary.totalSpent,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (a, b) => new Date(b.outing.startDate).getTime() - new Date(a.outing.startDate).getTime(),
      );
  }, [outings, allExpenses, allSettlements, friend.id]);

  /** One-off shared bills with this friend — standalone, never an outing. */
  const friendSplitRows = useMemo(() => {
    return friendSplits
      .filter((split) =>
        split.members.some((member) => member.friendId === friend.id),
      )
      .map((split) => {
        const splitSettlements = friendSettlements.filter(
          (item) => item.friendSplitId === split.id,
        );
        const friendMember = split.members.find(
          (member) => member.friendId === friend.id,
        );
        if (!friendMember) return null;

        const currentMember = getCurrentUserMember(split.members);

        const balances = computeFriendSplitBalances(
          split.members,
          [split],
          splitSettlements,
        );
        const balance =
          balances.find((item) => item.member.id === friendMember.id)?.balance ?? 0;

        return {
          split,
          friendMember,
          currentMember,
          balance,
          settlements: splitSettlements,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (a, b) =>
          new Date(b.split.date).getTime() - new Date(a.split.date).getTime(),
      );
  }, [friendSplits, friendSettlements, friend.id]);

  /**
   * Every outstanding item with this friend — trips and one-off splits in one
   * list, so "Mark as Paid" works the same either way.
   */
  const pendingItems = useMemo(() => {
    const items: (SettlementTarget & { date: string; total: number })[] = [];

    for (const trip of friendTrips) {
      if (Math.abs(trip.balance) < 0.01) continue;
      items.push({
        kind: "outing",
        referenceId: trip.outing.id,
        referenceName: trip.outing.name,
        friendId: friend.id,
        friendName: friend.name,
        friendMemberId: trip.friendMember.id,
        currentMemberId: trip.currentMember?.id ?? "me",
        outstanding: Math.abs(trip.balance),
        direction: settlementDirection(trip.balance),
        settled: 0,
        date: trip.outing.startDate,
        total: trip.totalSpent,
      });
    }

    for (const row of friendSplitRows) {
      if (Math.abs(row.balance) < 0.01) continue;
      items.push({
        kind: "friend-split",
        referenceId: row.split.id,
        referenceName: row.split.description,
        friendId: friend.id,
        friendName: friend.name,
        friendMemberId: row.friendMember.id,
        currentMemberId: row.currentMember?.id ?? "me",
        outstanding: Math.abs(row.balance),
        direction: settlementDirection(row.balance),
        settled: row.settlements.reduce((sum, item) => sum + item.amount, 0),
        date: row.split.date,
        total: row.split.amount,
      });
    }

    return items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [friendTrips, friendSplitRows, friend.id, friend.name]);

  /** Net across everything: positive = friend owes you, negative = you owe. */
  const netBalance = useMemo(
    () =>
      pendingItems.reduce(
        (sum, item) =>
          sum + (item.direction === "receive" ? item.outstanding : -item.outstanding),
        0,
      ),
    [pendingItems],
  );

  const youAreOwed = netBalance > 0.01;
  const youOwe = netBalance < -0.01;
  const lastOuting = friendTrips[0];

  /** Past settlements against this friend, newest first, from both sources. */
  const settlementHistory = useMemo(() => {
    const entries: {
      id: string;
      referenceName: string;
      amount: number;
      date: string;
      received: boolean;
    }[] = [];

    for (const trip of friendTrips) {
      const memberIds = new Set([trip.friendMember.id, trip.currentMember?.id].filter(Boolean));
      for (const settlement of allSettlements) {
        if (settlement.outingId !== trip.outing.id) continue;
        if (
          !memberIds.has(settlement.fromMemberId) ||
          !memberIds.has(settlement.toMemberId)
        ) {
          continue;
        }
        entries.push({
          id: settlement.id,
          referenceName: trip.outing.name,
          amount: settlement.amount,
          date: settlement.date,
          received: settlement.fromMemberId === trip.friendMember.id,
        });
      }
    }

    for (const row of friendSplitRows) {
      for (const settlement of row.settlements) {
        entries.push({
          id: settlement.id,
          referenceName: row.split.description,
          amount: settlement.amount,
          date: settlement.date,
          received: settlement.fromMemberId === row.friendMember.id,
        });
      }
    }

    return entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [friendTrips, friendSplitRows, allSettlements]);

  async function handleRemove() {
    await removeFriend(friend.id);
    setRemoveConfirmOpen(false);
    notify({ title: "Friend deleted successfully." });
    router.push("/friends");
  }

  async function handleEditSubmit(values: FriendFormValues) {
    await updateFriend({ ...friend, ...values });
    notify({ title: "Friend updated successfully." });
  }

  function handleCopyReminder() {
    const text = `Hi ${friend.name}, friendly reminder for the pending balance of ${formatCurrency(Math.abs(netBalance))}. Please settle up whenever you get a chance. Thanks!`;
    navigator.clipboard.writeText(text);
    notify({ title: "Reminder copied to clipboard!" });
  }

  function handleSendWhatsAppReminder() {
    const text = `Hi ${friend.name}, friendly reminder for the pending balance of ${formatCurrency(Math.abs(netBalance))}. Please settle up whenever you get a chance. Thanks!`;
    const cleanPhone = (friend.phone || "").replace(/[^\d]/g, "");
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="grid gap-6 pb-12">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          href="/friends"
        >
          <ArrowLeft className="size-3.5" />
          Back to Friends
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
            {friendInitials(friend.name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {friend.name}
            </h1>

            {/* Contact details: Phone and UPI IDs */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {friend.phone ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(friend.phone!);
                    notify({ title: `Copied ${friend.phone} to clipboard` });
                  }}
                  className="inline-flex items-center gap-1.5 font-mono text-xs rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-foreground transition-colors hover:bg-muted"
                  title="Click to copy phone number"
                >
                  <Phone className="size-3 text-primary" />
                  <span>{friend.phone}</span>
                  <Copy className="size-2.5 text-muted-foreground" />
                </button>
              ) : null}
              {upiList.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {upiList.map((upi) => (
                    <button
                      key={upi.toLowerCase()}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(upi);
                        notify({ title: `Copied ${upi} to clipboard` });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-mono font-medium text-foreground transition-colors hover:bg-muted hover:border-primary/40 cursor-pointer"
                      title="Click to copy UPI ID"
                    >
                      <span>{upi}</span>
                      <Copy className="size-2.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Notes if available */}
            {friend.notes ? (
              <p className="mt-2 text-xs text-muted-foreground rounded-lg bg-muted/30 border border-border/60 p-2 max-w-lg">
                <span className="font-semibold text-foreground">Note: </span>
                {friend.notes}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {friend.createdAt ? (
                <span>
                  Added{" "}
                  {new Date(friend.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              ) : null}
              {lastOuting ? (
                <span>
                  Last outing: {lastOuting.outing.name} ·{" "}
                  {formatOutingDates(lastOuting.outing)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Buttons: Edit and Delete */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="h-9 gap-1.5 rounded-[0.5rem] text-xs font-semibold shadow-xs"
          >
            <Pencil className="size-3.5" />
            Edit Friend
          </Button>
          <Button
            variant="destructive"
            onClick={() => setRemoveConfirmOpen(true)}
            className="h-9 gap-1.5 rounded-[0.5rem] text-xs font-semibold shadow-xs"
          >
            <Trash2 className="size-3.5" />
            Remove Friend
          </Button>
        </div>
      </div>

      <div className="sx-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Current balance
            </p>
            {!youAreOwed && !youOwe ? (
              <p className="mt-2 text-2xl font-semibold text-muted-foreground">
                All settled
              </p>
            ) : (
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold tabular-nums",
                  youAreOwed ? "text-success" : "text-destructive",
                )}
              >
                {youAreOwed
                  ? `${friend.name} owes you `
                  : "You owe "}
                {formatCurrency(Math.abs(netBalance))}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Across {friendTrips.length} outing{friendTrips.length === 1 ? "" : "s"} and{" "}
              {friendSplitRows.length} split expense
              {friendSplitRows.length === 1 ? "" : "s"}.
            </p>
          </div>

          {youAreOwed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-9 gap-1.5 rounded-[0.5rem] text-xs font-semibold shadow-xs"
                onClick={handleCopyReminder}
              >
                <Copy className="size-3.5" />
                Copy Reminder
              </Button>
              <Button
                variant="default"
                className="h-9 gap-1.5 rounded-[0.5rem] text-xs font-semibold shadow-xs"
                onClick={handleSendWhatsAppReminder}
              >
                <Send className="size-3.5" />
                Remind via WhatsApp
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Pending</h2>
        {pendingItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nothing outstanding with {friend.name}.
          </p>
        ) : (
          <div className="grid gap-3">
            {pendingItems.map((item) => (
              <div
                key={`${item.kind}-${item.referenceId}`}
                className="sx-surface flex flex-wrap items-center justify-between gap-3 p-5"
              >
                <div className="min-w-0">
                  {item.kind === "outing" ? (
                    <Link
                      className="text-base font-semibold text-foreground hover:underline"
                      href={`/outings/${item.referenceId}`}
                    >
                      {item.referenceName}
                    </Link>
                  ) : (
                    <p className="text-base font-semibold text-foreground">
                      {item.referenceName}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.kind === "outing" ? "Outing" : "Split expense"} ·
                    Pending
                    {item.settled > 0
                      ? ` · ${formatCurrency(item.settled)} settled`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      item.direction === "receive"
                        ? "text-success"
                        : "text-destructive",
                    )}
                  >
                    {formatCurrency(item.outstanding)}
                  </span>
                  <Button
                    variant={item.direction === "receive" ? "outline" : "default"}
                    onClick={() => setSettleTarget(item)}
                  >
                    {item.direction === "receive"
                      ? "Mark as Received"
                      : "Mark as Paid"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Settlement history
        </h2>
        {settlementHistory.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No settlements recorded yet.
          </p>
        ) : (
          <div className="sx-surface divide-y divide-border/60">
            {settlementHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {settlementMerchant(entry.referenceName, friend.name)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    entry.received ? "text-success" : "text-destructive",
                  )}
                >
                  {entry.received ? "Received " : "Paid "}
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {settleTarget ? (
        <SettleUpDialog
          key={`${settleTarget.kind}-${settleTarget.referenceId}`}
          open
          target={settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          onRecorded={() => setSettleTarget(null)}
        />
      ) : null}

      {/* Edit Friend Dialog */}
      {editOpen ? (
        <FriendFormDialog
          open={editOpen}
          friend={friend}
          onOpenChange={setEditOpen}
          onSubmit={handleEditSubmit}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={removeConfirmOpen}
        itemLabel="Friend"
        description="Are you sure you want to delete this friend and all related split expenses, settlements and transactions?"
        detail={friend.name}
        onOpenChange={setRemoveConfirmOpen}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}
