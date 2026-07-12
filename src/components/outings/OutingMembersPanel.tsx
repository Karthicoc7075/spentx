"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getMemberPaidAndShare } from "@/lib/outings";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Outing, OutingExpense } from "@/types";

type OutingMembersPanelProps = {
  outing: Outing;
  expenses: OutingExpense[];
  balances: Array<{ member: Outing["members"][number]; balance: number }>;
};

export function OutingMembersPanel({
  outing,
  expenses,
  balances,
}: OutingMembersPanelProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {outing.members.map((member) => {
        const { paid, share } = getMemberPaidAndShare(member.id, expenses);
        const balance =
          balances.find((item) => item.member.id === member.id)?.balance ?? 0;

        return (
          <div key={member.id} className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {member.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-foreground">{member.name}</p>
                {member.isCurrentUser ? (
                  <p className="text-xs text-muted-foreground">You</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="mt-1 font-semibold">{formatCurrency(paid)}</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Share</p>
                <p className="mt-1 font-semibold">{formatCurrency(share)}</p>
              </div>
              <div className="rounded-xl border border-border/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p
                  className={cn(
                    "mt-1 font-semibold",
                    balance >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {balance >= 0 ? "+" : ""}
                  {formatCurrency(balance)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}