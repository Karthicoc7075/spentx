"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useOutingSettlements } from "@/hooks/useOutingSettlements";
import { useTransactions } from "@/hooks/useTransactions";
import { getCurrentUserMember } from "@/lib/outings";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import type { Outing } from "@/types";

type RecordSettlementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outing: Outing;
  fromMemberId: string;
  toMemberId: string;
  fromName: string;
  toName: string;
  suggestedAmount: number;
  /** True when the current user is the one being paid back (not the payer). */
  youAreOwed: boolean;
  onNotify?: (message: { title: string; description?: string }) => void;
  onRecorded?: () => void;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordSettlementDialog({
  open,
  onOpenChange,
  outing,
  fromMemberId,
  toMemberId,
  fromName,
  toName,
  suggestedAmount,
  youAreOwed,
  onNotify,
  onRecorded,
}: RecordSettlementDialogProps) {
  const { accounts } = useAccounts();
  const { addTransaction } = useTransactions();
  const { addSettlement } = useOutingSettlements(outing.id);

  const currentMember = getCurrentUserMember(outing.members);
  const isCurrentUserPaying = currentMember?.id === fromMemberId;
  const isCurrentUserReceiving = currentMember?.id === toMemberId || youAreOwed;
  const isUserInvolved = isCurrentUserPaying || isCurrentUserReceiving;

  const [amountInput, setAmountInput] = useState(
    suggestedAmount > 0 ? suggestedAmount.toString() : "",
  );
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const defaultAccountName =
    activeAccounts[0]?.name ?? accounts[0]?.name ?? "Cash";
  const [accountName, setAccountName] = useState(defaultAccountName);
  const effectiveAccount =
    accountName && accounts.some((a) => a.name === accountName)
      ? accountName
      : defaultAccountName;

  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const finalAmount = Number(amountInput);
    if (!finalAmount || Number.isNaN(finalAmount) || finalAmount <= 0) {
      setError("Please enter an amount greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Record settlement row in outing_settlements
      await addSettlement({
        outingId: outing.id,
        fromMemberId,
        toMemberId,
        amount: finalAmount,
        date,
        note: note.trim() || undefined,
      });

      // 2. Only write a personal ledger transaction if the current user is
      // actually paying or receiving the money. If member B pays member C,
      // it is tracked within the outing but does NOT affect the current user's bank.
      if (isUserInvolved) {
        const isReceive = isCurrentUserReceiving;
        await addTransaction({
          type: isReceive ? "income" : "expense",
          amount: finalAmount,
          totalAmount: finalAmount,
          merchant: isReceive
            ? `Settlement: ${fromName} → You`
            : `Settlement: You → ${toName}`,
          category: isReceive ? "Friend Returns" : "Settlements",
          account: effectiveAccount,
          accountName: effectiveAccount,
          purpose: outing.purposeId || PERSONAL_PURPOSE_ID,
          purposeId: outing.purposeId || PERSONAL_PURPOSE_ID,
          source: "manual",
          entrySource: "manual",
          date,
          transactionDate: date,
          status: "completed",
          note:
            note.trim() ||
            `Outing settlement for ${outing.name} (${fromName} → ${toName})`,
          outingId: outing.id,
          tags: [
            "settlement",
            `settlement:${isReceive ? "receive" : "send"}`,
            ...(isReceive ? ["reimbursement"] : []),
          ],
        });
      }

      onOpenChange(false);
      onNotify?.({
        title: "Settlement recorded",
        description: isUserInvolved
          ? `${formatCurrency(finalAmount)} ${isCurrentUserReceiving ? "received from" : "paid to"} ${isCurrentUserReceiving ? fromName : toName}.`
          : `${formatCurrency(finalAmount)} settled between ${fromName} and ${toName}.`,
      });
      onRecorded?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't record settlement.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Settlement</DialogTitle>
          <DialogDescription>
            {isCurrentUserReceiving
              ? `Record repayment received from ${fromName}`
              : isCurrentUserPaying
                ? `Record repayment to ${toName}`
                : `Record settlement between ${fromName} and ${toName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Member & Outing summary box */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">From (Payer)</p>
              <p className="mt-0.5 font-medium">{fromName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">To (Receiver)</p>
              <p className="mt-0.5 font-medium">{toName}</p>
            </div>
            <div className="col-span-2 flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-xs text-muted-foreground">Outing:</span>
              <span className="text-xs font-semibold">{outing.name}</span>
            </div>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <Label htmlFor="settle-amount">Amount (₹)</Label>
            <Input
              id="settle-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              aria-invalid={Boolean(error)}
              className={cn(error && "border-destructive")}
              onChange={(event) => {
                setAmountInput(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          {/* If user is involved, allow choosing Account */}
          {isUserInvolved ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settle-account">Account</Label>
                <Select
                  value={effectiveAccount}
                  onValueChange={setAccountName}
                >
                  <SelectTrigger id="settle-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.length === 0 ? (
                      <SelectItem value="Cash">Cash</SelectItem>
                    ) : (
                      accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.name}>
                          {acc.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settle-date">Date</Label>
                <Input
                  id="settle-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Date</Label>
              <Input
                id="settle-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="settle-note">Notes (optional)</Label>
            <Textarea
              id="settle-note"
              rows={2}
              placeholder="Optional notes or reference ID..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting || !amountInput.trim()}
              onClick={() => void handleConfirm()}
            >
              {submitting ? "Recording…" : "Record settlement"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
