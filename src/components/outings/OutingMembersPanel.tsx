"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getMemberPaidAndShare } from "@/lib/outings";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isDeletedMember, memberDisplayName } from "@/lib/settlements";
import { useDeletedFriends } from "@/hooks/useDeletedFriends";
import type { Outing, OutingExpense, TripMember } from "@/types";

type OutingMembersPanelProps = {
  outing: Outing;
  expenses: OutingExpense[];
  balances: Array<{ member: TripMember; balance: number }>;
  selectedMemberId?: string | null;
  onSelectMember?: (memberId: string | null) => void;
  viewerCreatedOuting?: boolean;
};

function balancePillClass(balance: number) {
  if (Math.abs(balance) < 0.01) return "fintech-pill-settled";
  return balance > 0 ? "fintech-pill-owed" : "fintech-pill-owe";
}

function balancePillLabel(balance: number) {
  if (Math.abs(balance) < 0.01) return "Settled";
  return balance > 0 ? `+${formatCurrency(balance)}` : `Owes ${formatCurrency(-balance)}`;
}

export function OutingMembersPanel({
  outing,
  expenses,
  balances,
  selectedMemberId,
  onSelectMember,
  viewerCreatedOuting,
}: OutingMembersPanelProps) {
  const { deletedFriendIds } = useDeletedFriends();
  function handleSelect(memberId: string) {
    onSelectMember?.(selectedMemberId === memberId ? null : memberId);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-sm font-semibold text-foreground">Group members</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Tap a member to see their contributions in this outing
        </p>
        <div className="flex flex-wrap gap-2">
          {outing.members.map((member) => {
            const isSelected = selectedMemberId === member.id;
            return (
              <button
                key={member.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-card/80 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                )}
                type="button"
                onClick={() => handleSelect(member.id)}
              >
                <Avatar className="size-5">
                  <AvatarFallback className="text-[9px]">
                    {member.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                {memberDisplayName(member, deletedFriendIds)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {outing.members.map((member) => {
          const { paid, share } = getMemberPaidAndShare(member.id, expenses);
          const balance =
            balances.find((item) => item.member.id === member.id)?.balance ?? 0;
          const isSelected = selectedMemberId === member.id;

          return (
            <button
              key={member.id}
              className={cn(
                "sx-surface-interactive p-5 text-left",
                isSelected ? "border-primary" : "hover:border-foreground/20",
              )}
              type="button"
              onClick={() => handleSelect(member.id)}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                      {member.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground">
                      {member.name}
                      {isDeletedMember(member, deletedFriendIds) ? (
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Deleted
                        </span>
                      ) : null}
                    </p>
                    {member.isCurrentUser && viewerCreatedOuting ? (
                      <p className="text-xs text-muted-foreground">Created outing</p>
                    ) : member.isCurrentUser ? (
                      <p className="text-xs text-muted-foreground">You</p>
                    ) : null}
                  </div>
                </div>
                <span className={cn("shrink-0", balancePillClass(balance))}>
                  {balancePillLabel(balance)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="mt-1 font-semibold">{formatCurrency(paid)}</p>
                </div>
                <div className="rounded-xl border border-border/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Share</p>
                  <p className="mt-1 font-semibold">{formatCurrency(share)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
