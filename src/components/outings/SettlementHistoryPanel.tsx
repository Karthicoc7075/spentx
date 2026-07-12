"use client";

import { ArrowDownLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Outing, OutingSettlement } from "@/types";

type SettlementHistoryPanelProps = {
  records: OutingSettlement[];
  outing: Outing;
};

export function SettlementHistoryPanel({
  records,
  outing,
}: SettlementHistoryPanelProps) {
  const currentMemberId =
    outing.members.find((member) => member.isCurrentUser)?.id ??
    outing.members[0]?.id;

  if (records.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No settle or return payments recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => {
        const youReceived = record.toMemberId === currentMemberId;
        const youPaid = record.fromMemberId === currentMemberId;
        const fromName =
          outing.members.find((member) => member.id === record.fromMemberId)
            ?.name ?? "Member";
        const toName =
          outing.members.find((member) => member.id === record.toMemberId)
            ?.name ?? "Member";

        let label = "";
        if (youReceived) {
          label = `You received ${formatCurrency(record.amount)} from ${fromName}`;
        } else if (youPaid) {
          label = `You paid ${formatCurrency(record.amount)} to ${toName}`;
        } else {
          label = `${fromName} paid ${formatCurrency(record.amount)} to ${toName}`;
        }

        return (
          <div
            key={record.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border p-4",
              youReceived && "border-success/20 bg-success/5",
              youPaid && "border-destructive/20 bg-destructive/5",
              !youReceived && !youPaid && "border-border/40 bg-muted/20",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  youReceived && "bg-success/15",
                  youPaid && "bg-destructive/15",
                  !youReceived && !youPaid && "bg-muted",
                )}
              >
                {youReceived ? (
                  <ArrowDownLeft className="size-4 text-success" />
                ) : youPaid ? (
                  <ArrowUpRight className="size-4 text-destructive" />
                ) : (
                  <ArrowRight className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">
                  Settlement · {formatDate(record.date)}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold",
                youReceived && "text-success",
                youPaid && "text-destructive",
                !youReceived && !youPaid && "text-foreground",
              )}
            >
              {youReceived && "+"}
              {youPaid && "-"}
              {formatCurrency(record.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}