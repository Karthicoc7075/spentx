"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { usePurposes } from "@/hooks/usePurposes";
import { getDefaultPersonalPurpose } from "@/lib/purposes";
import { parseAmountInput } from "@/lib/investments";
import { useToast } from "@/providers/toast-provider";
import { formatCurrency } from "@/lib/utils";
import { Check, Coins, Landmark, Loader2, Sparkles } from "lucide-react";
import type { SavingsGoal } from "@/types";

type QuickDepositModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: SavingsGoal | null;
  onSuccess?: () => void;
};

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];

export function QuickDepositModal({
  open,
  onOpenChange,
  goal,
  onSuccess,
}: QuickDepositModalProps) {
  const { addFunds } = useSavingsGoals();
  const { addTransaction, deleteTransaction } = useTransactions();
  const { accounts } = useAccounts();
  const { purposes } = usePurposes();
  const { notify } = useToast();

  const [amount, setAmount] = useState("1000");
  const [sourceChoice, setSourceAccount] = useState<string>("");
  const [deductFromBank, setDeductFromBank] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.isActive !== false && (a.type === "bank" || a.type === "wallet"),
      ),
    [accounts],
  );

  // Accounts usually load after the first render; derive the default from the
  // loaded list instead of freezing an empty value into state at mount time.
  const sourceAccount =
    sourceChoice && bankAccounts.some((a) => a.name === sourceChoice)
      ? sourceChoice
      : (bankAccounts.find((a) => a.type === "bank")?.name ?? bankAccounts[0]?.name ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal) return;

    const depositAmount = parseAmountInput(amount);
    if (depositAmount === null || depositAmount <= 0) {
      setError("Please enter a valid deposit amount.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let txId: string | undefined;
    try {
      // 1. Optionally record the bank debit first so the contribution can link
      //    to it (deleting that transaction later reverses the deposit).
      if (deductFromBank && sourceAccount) {
        const tx = await addTransaction({
          type: "expense",
          amount: depositAmount,
          totalAmount: depositAmount,
          merchant: `Savings: ${goal.name}`,
          category: "Settlements",
          account: sourceAccount,
          purpose: getDefaultPersonalPurpose(purposes)?.id ?? "personal",
          source: "manual",
          date: new Date().toISOString(),
          note: `Quick deposit into savings goal "${goal.name}"`,
          tags: ["savings", "transfer", `goal:${goal.id}`],
          paymentMethod: "UPI",
        });
        txId = tx.id;
      }

      // 2. Atomic server-side increment (same RPC as the mobile app).
      try {
        await addFunds(goal.id, depositAmount, { transactionId: txId });
      } catch (rpcError) {
        if (txId) await deleteTransaction(txId).catch(() => undefined);
        throw rpcError;
      }

      notify({
        title: "Deposit recorded! 🎉",
        description: `Added ${formatCurrency(depositAmount)} to "${goal.name}".`,
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deposit failed.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!goal) return null;

  const remaining = Math.max(0, goal.targetAmount - (goal.savedAmount || 0));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-2xl border bg-card">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="p-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-xl">
                {goal.icon || "🎯"}
              </span>
              <div>
                <DialogTitle className="text-base font-bold">
                  Quick Deposit to {goal.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Target: {formatCurrency(goal.targetAmount)} · Remaining: {formatCurrency(remaining)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {/* Deposit Amount */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Deposit Amount (₹)</Label>
              <Input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
                className="h-11 text-lg font-bold rounded-xl"
                autoFocus
              />

              {/* Quick preset chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset.toString())}
                    className="px-2.5 py-1 text-xs rounded-lg border bg-muted/50 hover:bg-muted font-medium transition-colors"
                  >
                    +{formatCurrency(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Funding Source Account */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Funding Account</Label>
              <select
                value={sourceAccount}
                onChange={(e) => setSourceAccount(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-xl border bg-background text-foreground"
              >
                {bankAccounts.length === 0 ? (
                  <option value="">No bank accounts configured</option>
                ) : (
                  bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.name}>
                      {acc.name} ({acc.type})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Deduct Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border cursor-pointer">
              <input
                type="checkbox"
                checked={deductFromBank}
                onChange={(e) => setDeductFromBank(e.target.checked)}
                className="mt-0.5 rounded text-primary"
              />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Deduct from account balance</p>
                <p className="text-muted-foreground mt-0.5">
                  Records an internal savings transfer so your bank account balance stays accurate.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="rounded-xl gap-2 font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <Coins className="size-4" />
                  Deposit Funds
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
