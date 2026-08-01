"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useTransactions } from "@/hooks/useTransactions";
import { getTodayCalendarDate } from "@/lib/date-filters";
import { queryKeys } from "@/lib/query-keys";
import { dismissBankOnboarding, saveAccount } from "@/lib/supabase-data";
import { buildOpeningBalanceTransaction } from "@/lib/wealth";
import type { Account } from "@/types";

type InitialAccountSetupModalProps = {
  open: boolean;
};

export function InitialAccountSetupModal({ open }: InitialAccountSetupModalProps) {
  const { user } = useAuthReady();
  const { accounts } = useAccounts();
  const { addTransaction } = useTransactions();
  const queryClient = useQueryClient();

  const [cashBalance, setCashBalance] = useState("0");
  const [bankName, setBankName] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [bankBalance, setBankBalance] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hides the modal immediately on success rather than waiting on query
  // refetches to flip `open` back to false.
  const [completed, setCompleted] = useState(false);

  if (!open || completed || !user?.id) return null;

  async function handleSubmit() {
    if (!user?.id) return;
    if (!bankName.trim()) {
      setError("Enter your bank account name.");
      return;
    }
    const cashAmount = Number(cashBalance);
    const bankAmount = Number(bankBalance);
    if (!Number.isFinite(cashAmount) || cashAmount < 0) {
      setError("Enter a valid cash balance.");
      return;
    }
    if (!Number.isFinite(bankAmount) || bankAmount < 0) {
      setError("Enter a valid bank account balance.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const today = getTodayCalendarDate();
      const cashAccount = accounts.find(
        (account) => account.type === "cash" && account.name === "Cash",
      );

      if (cashAccount) {
        const updatedCashAccount: Account = {
          ...cashAccount,
          openingBalance: cashAmount,
          openingBalanceDate: cashAccount.openingBalanceDate ?? today,
        };
        await saveAccount(user.id, updatedCashAccount);
        if (cashAmount > 0) {
          await addTransaction(buildOpeningBalanceTransaction(updatedCashAccount));
        }
      }

      const bankAccount: Account = {
        id: crypto.randomUUID(),
        name: bankName.trim(),
        type: "bank",
        last4: bankLast4.trim() || "0000",
        openingBalance: bankAmount,
        openingBalanceDate: today,
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      await saveAccount(user.id, bankAccount);
      if (bankAmount > 0) {
        await addTransaction(buildOpeningBalanceTransaction(bankAccount));
      }

      await dismissBankOnboarding(user.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(user.id) });
      await queryClient.invalidateQueries({ queryKey: ["bankOnboarding", user.id] });
      setCompleted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Couldn't save your accounts. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!user?.id) return;
    setIsSubmitting(true);
    try {
      await dismissBankOnboarding(user.id);
      await queryClient.invalidateQueries({ queryKey: ["bankOnboarding", user.id] });
      setCompleted(true);
    } catch {
      setCompleted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="sx-surface w-full max-w-md space-y-4 p-6">
        <div className="space-y-1 border-b border-border/60 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="size-4 text-primary" /> Set up your accounts
          </h3>
          <p className="text-xs text-muted-foreground">
            Tell us what you&apos;re starting with so your balances are accurate from
            day one.
          </p>
        </div>

        <div className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <Label htmlFor="setup-cash-balance" className="text-[10px] font-bold uppercase text-muted-foreground">
              Cash balance
            </Label>
            <Input
              id="setup-cash-balance"
              inputMode="decimal"
              type="number"
              value={cashBalance}
              onChange={(event) => setCashBalance(event.target.value)}
            />
          </div>

          <div className="space-y-1 border-t border-border/60 pt-3.5">
            <Label htmlFor="setup-bank-name" className="text-[10px] font-bold uppercase text-muted-foreground">
              Bank account name
            </Label>
            <Input
              id="setup-bank-name"
              placeholder="e.g. HDFC Bank, SBI Account"
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="setup-bank-last4" className="text-[10px] font-bold uppercase text-muted-foreground">
                Last 4 digits
              </Label>
              <Input
                id="setup-bank-last4"
                maxLength={4}
                placeholder="e.g. 5621"
                value={bankLast4}
                onChange={(event) => setBankLast4(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-bank-balance" className="text-[10px] font-bold uppercase text-muted-foreground">
                Bank balance
              </Label>
              <Input
                id="setup-bank-balance"
                inputMode="decimal"
                type="number"
                value={bankBalance}
                onChange={(event) => setBankBalance(event.target.value)}
              />
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full text-xs font-bold"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            <Landmark className="mr-1.5 size-4" />
            {isSubmitting ? "Saving..." : "Continue to dashboard"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground hover:text-foreground"
            disabled={isSubmitting}
            onClick={handleSkip}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
