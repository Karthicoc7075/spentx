"use client";

import { useState } from "react";
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
import { useAuthReady } from "@/hooks/useAuthReady";
import { useQueryClient } from "@tanstack/react-query";
import { saveAccount } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/providers/toast-provider";
import { useTransactions } from "@/hooks/useTransactions";
import { buildOpeningBalanceTransaction } from "@/lib/wealth";
import { getTodayCalendarDate } from "@/lib/date-filters";
import {
  Landmark,
  Wallet,
  PlusCircle,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Account } from "@/types";
import { cn } from "@/lib/utils";

type AccountTypeOption = {
  type: Account["type"];
  label: string;
  icon: typeof Landmark;
  description: string;
};

const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    type: "bank",
    label: "Bank Account",
    icon: Landmark,
    description: "Savings or checking account",
  },
  {
    type: "wallet",
    label: "Digital Wallet",
    icon: Wallet,
    description: "Paytm, PhonePe wallet, etc.",
  },
];

type NewAccountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (account: Account) => void;
};

export function NewAccountModal({
  open,
  onOpenChange,
  onSuccess,
}: NewAccountModalProps) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { addTransaction } = useTransactions();

  const todayStr = getTodayCalendarDate();

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<Account["type"]>("bank");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingDate, setOpeningDate] = useState(todayStr);
  const [last4, setLast4] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setAccountType("bank");
    setOpeningBalance("0");
    setOpeningDate(getTodayCalendarDate());
    setLast4("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) {
      setError("You must be logged in to create an account.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please provide an account name (e.g., 'SBI Bank').");
      return;
    }

    const parsedBalance = parseFloat(openingBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError("Please enter a valid non-negative opening balance.");
      return;
    }

    const effectiveDate = openingDate.trim() || todayStr;
    const nowIso = new Date().toISOString();

    setIsSubmitting(true);
    setError(null);

    try {
      const newAccount: Account = {
        id: crypto.randomUUID(),
        name: trimmedName,
        type: accountType,
        last4: last4.trim() ? last4.trim().slice(-4) : undefined,
        openingBalance: parsedBalance,
        openingBalanceDate: effectiveDate,
        createdAt: nowIso,
        isActive: true,
      };

      // 1. Save account to database
      await saveAccount(user.id, newAccount);

      // 2. If opening balance > 0, register opening balance transaction
      if (parsedBalance > 0) {
        try {
          await addTransaction(buildOpeningBalanceTransaction(newAccount));
        } catch (txErr) {
          console.error("Failed to record opening balance transaction:", txErr);
        }
      }

      // 3. Invalidate React Query cache to immediately update all wealth cards and daily snapshots
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(user.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions(user.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.netWorthHistory(user.id) }),
      ]);

      notify({
        title: "Account Created",
        description: `"${newAccount.name}" added to today's daily snapshot onward. Past snapshots remain unchanged.`,
      });

      onSuccess?.(newAccount);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to create account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-1.5rem)] sm:w-full max-w-lg p-0 gap-0 overflow-hidden rounded-2xl border border-border shadow-xl bg-card"
      >
        {/* Header */}
        <DialogHeader className="px-4.5 py-4 sm:px-6 sm:py-5 border-b border-border bg-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <PlusCircle className="size-4.5 sm:size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                  Add New Account
                </DialogTitle>
                <DialogDescription className="mt-0.5 sm:mt-1 text-xs text-muted-foreground leading-relaxed">
                  Add an account to your portfolio. It will appear in today&apos;s Daily
                  Snapshot onward without altering past records.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0 -mr-1"
              onClick={() => onOpenChange(false)}
              title="Close"
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-4.5 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 max-h-[68vh] sm:max-h-[65vh] overflow-y-auto">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
                {error}
              </div>
            ) : null}

            {/* Account Type Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Account Type
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ACCOUNT_TYPES.map((item) => {
                  const Icon = item.icon;
                  const isSelected = accountType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setAccountType(item.type)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5 text-primary shadow-xs ring-1 ring-primary/30"
                          : "border-border bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg shrink-0 transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            isSelected ? "text-foreground" : "text-foreground/80",
                          )}
                        >
                          {item.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account Name */}
            <div className="space-y-2">
              <Label htmlFor="account-name" className="text-xs font-semibold text-foreground">
                Account Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="account-name"
                type="text"
                placeholder="e.g. SBI Bank, HDFC Salary, Emergency Cash"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-9.5 text-xs px-3.5 rounded-lg"
                autoFocus
              />
            </div>

            {/* Opening Balance & Opening Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Opening Balance */}
              <div className="space-y-2">
                <Label htmlFor="opening-balance" className="text-xs font-semibold text-foreground">
                  Initial Balance (₹)
                </Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="opening-balance"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="pl-8 h-9.5 text-xs font-mono rounded-lg"
                  />
                </div>
              </div>

              {/* Opening Date */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="opening-date" className="text-xs font-semibold text-foreground">
                    Active From Date
                  </Label>
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    Today
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="opening-date"
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    max={todayStr}
                    className="h-9.5 text-xs font-mono px-3.5 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Last 4 Digits (Optional for banks) */}
            {accountType === "bank" ? (
              <div className="space-y-2">
                <Label htmlFor="last4" className="text-xs font-semibold text-foreground">
                  Last 4 Digits <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Input
                  id="last4"
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 4321"
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                  className="h-9.5 text-xs font-mono px-3.5 rounded-lg"
                />
              </div>
            ) : null}


          </div>

          {/* Footer Actions */}
          <DialogFooter className="mx-0 mb-0 shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-border bg-muted/20 px-4.5 py-3.5 sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-xs h-9 px-4 rounded-lg font-medium w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="text-xs h-9 px-4 rounded-lg font-semibold shadow-xs gap-1.5 w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <PlusCircle className="size-3.5" />
                  Create Account
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
