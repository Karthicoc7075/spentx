"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/hooks/useAccounts";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { useDeletedFriends } from "@/hooks/useDeletedFriends";
import { useOutingSettlements } from "@/hooks/useOutingSettlements";
import { useTransactions } from "@/hooks/useTransactions";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import {
  settlementMembers,
  settlementMerchant,
  settlementStatus,
  type SettlementTarget,
} from "@/lib/settlements";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

type SettleUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SettlementTarget;
  onRecorded?: () => void;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Settle up against one outing or one friend split. Writes the settlement
 * row to whichever table owns the reference, then a normal ledger
 * transaction — expense when you send money, income when you receive it —
 * counted like any other transaction (no special Settlements category).
 */
export function SettleUpDialog({
  open,
  onOpenChange,
  target,
  onRecorded,
}: SettleUpDialogProps) {
  const { accounts } = useAccounts();
  const { notify } = useToast();
  const { addTransaction } = useTransactions();
  const { addSettlement: addOutingSettlement } = useOutingSettlements(
    target.kind === "outing" ? target.referenceId : undefined,
  );
  const { addSettlement: addFriendSettlement } = useFriendSplits();
  const { deletedFriendIds } = useDeletedFriends();

  const [mode, setMode] = useState<"full" | "custom">("full");
  const [customAmount, setCustomAmount] = useState(String(target.outstanding));
  const [accountName, setAccountName] = useState(accounts[0]?.name ?? "Cash");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isReceive = target.direction === "receive";
  const isDeletedFriend = deletedFriendIds.has(target.friendId);
  const amount =
    mode === "full" ? target.outstanding : Number(customAmount) || 0;
  const status = settlementStatus(target.outstanding, amount);

  async function handleConfirm() {
    if (isDeletedFriend) {
      setError("This friend has been deleted and can't receive new settlements.");
      return;
    }
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (amount > target.outstanding + 0.01) {
      setError(
        `Amount can't exceed the outstanding ${formatCurrency(target.outstanding)}.`,
      );
      return;
    }

    const { fromMemberId, toMemberId } = settlementMembers(target);
    setSubmitting(true);
    try {
      if (target.kind === "outing") {
        await addOutingSettlement({
          outingId: target.referenceId,
          fromMemberId,
          toMemberId,
          amount,
          date,
          note: note.trim() || undefined,
        });
      } else {
        await addFriendSettlement({
          friendSplitId: target.referenceId,
          fromMemberId,
          toMemberId,
          amount,
          date,
          note: note.trim() || undefined,
        });
      }

      // Money in when they repay you, money out when you repay them. Shown
      // as a normal transaction — counted in Income/Expense like any other
      // row, just under its own category so it can still be called out
      // separately (TransactionSummaryStrip) instead of being lumped into
      // "Other Income". Only the receive direction gets that category —
      // paying a friend back isn't a "friend return".
      await addTransaction({
        type: isReceive ? "income" : "expense",
        amount,
        totalAmount: amount,
        merchant: settlementMerchant(target.referenceName, target.friendName),
        category: isReceive ? "Friend Returns" : "Miscellaneous",
        account: accountName,
        accountName,
        purpose: PERSONAL_PURPOSE_ID,
        purposeId: PERSONAL_PURPOSE_ID,
        source: "manual",
        entrySource: "manual",
        date,
        transactionDate: date,
        status: "completed",
        note:
          note.trim() ||
          `${isReceive ? "Received from" : "Paid to"} ${target.friendName} · ${
            status.isFull ? "Full settlement" : `Remaining ${formatCurrency(status.remaining)}`
          }`,
        // Keeps the ledger row traceable back to the trip it settles.
        outingId: target.kind === "outing" ? target.referenceId : null,
        tags: [
          `settlement:${target.direction}`,
          `friend:${target.friendId}`,
          `${target.kind}:${target.referenceId}`,
          status.isFull ? "settlement:full" : "settlement:partial",
        ],
      });

      onOpenChange(false);
      notify({
        title: isReceive
          ? `Received ${formatCurrency(amount)} from ${target.friendName}.`
          : `Paid ${formatCurrency(amount)} to ${target.friendName}.`,
        description: status.isFull
          ? "Settled in full."
          : `Remaining ${formatCurrency(status.remaining)}.`,
      });
      onRecorded?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settlement</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Reference</p>
              <p className="mt-0.5 font-medium">{target.referenceName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Friend</p>
              <p className="mt-0.5 font-medium">{target.friendName}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">
                Outstanding amount
              </p>
              <p
                className={cn(
                  "mt-0.5 text-lg font-semibold tabular-nums",
                  isReceive ? "text-success" : "text-destructive",
                )}
              >
                {formatCurrency(target.outstanding)}
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  {isReceive ? "to receive" : "to pay"}
                </span>
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Settlement type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "full" ? "default" : "outline"}
                onClick={() => {
                  setMode("full");
                  setError("");
                }}
              >
                Full amount
              </Button>
              <Button
                type="button"
                variant={mode === "custom" ? "default" : "outline"}
                onClick={() => setMode("custom")}
              >
                Custom amount
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="settle-amount">Amount</Label>
            <Input
              id="settle-amount"
              inputMode="decimal"
              disabled={mode === "full"}
              value={mode === "full" ? String(target.outstanding) : customAmount}
              className={cn(error && "border-destructive")}
              onChange={(event) => {
                setCustomAmount(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {!error && mode === "custom" && amount > 0 && !status.isFull ? (
              <p className="text-xs text-muted-foreground">
                Remaining after this: {formatCurrency(status.remaining)} ·{" "}
                {status.label}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Account</Label>
              <Select value={accountName} onValueChange={setAccountName}>
                <SelectTrigger>
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.name}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settle-date">Date</Label>
              <Input
                id="settle-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="settle-note">Notes</Label>
            <Textarea
              id="settle-note"
              rows={2}
              placeholder="Optional"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || isDeletedFriend}
            onClick={() => void handleConfirm()}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
