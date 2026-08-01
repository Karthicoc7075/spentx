"use client";

import { useState } from "react";
import { OutingRollupPromptDialog } from "@/components/outings/OutingRollupPromptDialog";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
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
import { useAccounts } from "@/hooks/useAccounts";
import { useOutingExpenses } from "@/hooks/useOutingExpenses";
import { useOutingSettlements } from "@/hooks/useOutingSettlements";
import { useTransactions } from "@/hooks/useTransactions";
import {
  buildOutingRollupDraft,
  computeTripSummary,
  hasOutingRollupTransaction,
} from "@/lib/outings";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import type { Outing, Transaction } from "@/types";

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

/** Reusable "Return"/"Settle" flow — shared by the Outing Detail Activity tab
 * and Friend Detail's per-outing Return buttons, so both entry points write
 * the exact same settlements row + personal transaction + rollup prompt.
 * Form state is seeded once on mount — pass `key={`${outing.id}-${fromMemberId}-${toMemberId}`}`
 * at the call site so opening it for a different member pair remounts
 * instead of reusing a stale amount. */
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
  const { addTransaction, transactions } = useTransactions();
  const { expenses } = useOutingExpenses(outing.id);
  const { settlements, addSettlement } = useOutingSettlements(outing.id);

  const [amountInput, setAmountInput] = useState(suggestedAmount.toString());
  const [rollupPromptOpen, setRollupPromptOpen] = useState(false);
  const [rollupSlideOpen, setRollupSlideOpen] = useState(false);
  const [rollupDraft, setRollupDraft] = useState<Transaction | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  async function handleConfirm() {
    const finalAmount = Number(amountInput) || suggestedAmount;
    if (finalAmount <= 0) return;

    const settlementDate = new Date().toISOString().slice(0, 10);

    await addSettlement({
      outingId: outing.id,
      fromMemberId,
      toMemberId,
      amount: finalAmount,
      date: settlementDate,
    });

    const defaultAccount = accounts[0]?.name ?? "Cash";
    await addTransaction({
      type: "expense",
      amount: finalAmount,
      merchant: `Settlement: ${fromName} → ${toName}`,
      category: "Settlements",
      account: defaultAccount,
      purpose: PERSONAL_PURPOSE_ID,
      source: "manual",
      date: settlementDate,
      note: `Outing settlement for ${outing.name}`,
      outingId: outing.id,
    });

    onOpenChange(false);
    onNotify?.({
      title: "Settlement recorded",
      description: "Trip balance and transactions updated.",
    });
    onRecorded?.();

    const summary = computeTripSummary(outing, expenses, settlements);
    if (summary.yourShare > 0 && !hasOutingRollupTransaction(transactions, outing.id)) {
      setRollupDraft(
        buildOutingRollupDraft(
          outing,
          summary.yourShare,
          defaultAccount,
          expenses[0]?.category ?? "",
        ) as Transaction,
      );
      setRollupPromptOpen(true);
    }
  }

  function handleRollupConfirm() {
    setRollupPromptOpen(false);
    if (rollupDraft) setRollupSlideOpen(true);
  }

  async function handleRollupSubmit(values: Omit<Transaction, "id">) {
    await addTransaction(values);
    setRollupSlideOpen(false);
    setRollupDraft(null);
    onNotify?.({
      title: "Outing logged",
      description: "Your share now appears in Dashboard and Analytics.",
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record settlement</DialogTitle>
            <DialogDescription>
              {youAreOwed
                ? `Record money received from ${fromName}`
                : `Record payment to ${toName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleConfirm()}>Record settlement</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <OutingRollupPromptDialog
        open={rollupPromptOpen}
        outingName={outing.name}
        yourShare={computeTripSummary(outing, expenses, settlements).yourShare}
        onConfirm={handleRollupConfirm}
        onOpenChange={setRollupPromptOpen}
      />

      <AddTransactionSlideOver
        hideOwnerToggle
        initialValues={rollupDraft ?? undefined}
        mode="expense"
        open={rollupSlideOpen}
        onOpenChange={(nextOpen) => {
          setRollupSlideOpen(nextOpen);
          if (!nextOpen) setRollupDraft(null);
        }}
        onSubmit={handleRollupSubmit}
      />
    </>
  );
}
