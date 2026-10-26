"use client";

import { useEffect, useState } from "react";
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
  CreditCard,
  Landmark,
  Wallet,
  PlusCircle,
  Loader2,
  X,
} from "lucide-react";
import type { Account } from "@/types";
import { cn } from "@/lib/utils";
import { accountKindOf, isDebitCardVirtual } from "@/lib/account-kinds";

type FormKind = "bank" | "debit_card" | "credit_card" | "wallet" | "cash";

type AccountTypeOption = {
  type: FormKind;
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
    type: "debit_card",
    label: "Debit Card",
    icon: CreditCard,
    description: "Linked to a bank account",
  },
  {
    type: "credit_card",
    label: "Credit Card",
    icon: CreditCard,
    description: "Tracks amount owed and due date",
  },
  {
    type: "wallet",
    label: "Wallet",
    icon: Wallet,
    description: "Paytm, PhonePe wallet, etc.",
  },
  // Investments are not accounts any more: add them on Wealth → Investments.
];

type NewAccountModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (account: Account) => void;
  /** When set, the modal edits this account (or debit card) instead of creating. */
  account?: Account | null;
  /** All accounts; needed to link debit cards to a bank. */
  accounts?: Account[];
};

function parseDay(value: string) {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : NaN;
}

export function NewAccountModal({
  open,
  onOpenChange,
  onSuccess,
  account: editing = null,
  accounts = [],
}: NewAccountModalProps) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { addTransaction } = useTransactions();

  const todayStr = getTodayCalendarDate();
  const isEdit = Boolean(editing);
  const editingDebit = editing ? isDebitCardVirtual(editing) : false;
  const banks = accounts.filter(
    (a) => a.isActive !== false && accountKindOf(a) === "bank",
  );

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<FormKind>("bank");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingDate, setOpeningDate] = useState(todayStr);
  const [last4, setLast4] = useState("");
  const [linkedBankId, setLinkedBankId] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [billDay, setBillDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !editing) return;
    setName(editing.name);
    setAccountType(accountKindOf(editing));
    setLast4(editing.last4 ?? "");
    setLinkedBankId(editing.linkedAccountId ?? "");
    setCreditLimit(editing.creditLimit != null ? String(editing.creditLimit) : "");
    setBillDay(editing.billDay != null ? String(editing.billDay) : "");
    setDueDay(editing.dueDay != null ? String(editing.dueDay) : "");
    setError(null);
  }, [open, editing]);

  function resetForm() {
    setName("");
    setAccountType("bank");
    setOpeningBalance("0");
    setOpeningDate(getTodayCalendarDate());
    setLast4("");
    setLinkedBankId("");
    setCreditLimit("");
    setBillDay("");
    setDueDay("");
    setError(null);
  }

  async function invalidate(userId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.netWorthHistory(userId) }),
    ]);
  }

  async function saveDebitCard(userId: string, digits: string) {
    const bank = banks.find((b) => b.id === linkedBankId);
    if (!bank) throw new Error("Choose the bank this debit card is linked to.");
    const oldBankId = editingDebit ? editing?.linkedAccountId : undefined;
    const oldLast4 = editingDebit ? editing?.last4 : undefined;
    if (oldBankId && oldBankId !== bank.id) {
      const oldBank = accounts.find((a) => a.id === oldBankId);
      if (oldBank) {
        await saveAccount(userId, {
          ...oldBank,
          linkedCardLast4: (oldBank.linkedCardLast4 ?? []).filter((c) => c !== oldLast4),
        });
      }
    }
    const current = (bank.linkedCardLast4 ?? []).filter(
      (c) => !(oldBankId === bank.id && c === oldLast4),
    );
    await saveAccount(userId, {
      ...bank,
      linkedCardLast4: Array.from(new Set([...current, digits])),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) {
      setError("You must be logged in to create an account.");
      return;
    }

    const isDebit = accountType === "debit_card";
    const isCredit = accountType === "credit_card";
    const trimmedName = name.trim();
    if (!isDebit && !trimmedName) {
      setError("Please provide an account name (e.g., 'SBI Bank').");
      return;
    }

    const digits = last4.trim();
    if (accountType !== "wallet" && accountType !== "cash" && !/^\d{4}$/.test(digits)) {
      setError("Enter the last 4 digits.");
      return;
    }
    if (isDebit && !linkedBankId) {
      setError("Choose the bank this debit card is linked to.");
      return;
    }

    let limit: number | undefined;
    let bill: number | undefined;
    let due: number | undefined;
    if (isCredit) {
      if (creditLimit.trim()) {
        limit = Number(creditLimit);
        if (!Number.isFinite(limit) || limit < 0) {
          setError("Enter a valid credit limit.");
          return;
        }
      }
      bill = parseDay(billDay);
      due = parseDay(dueDay);
      if (Number.isNaN(bill) || Number.isNaN(due)) {
        setError("Bill day and due day must be between 1 and 31.");
        return;
      }
    }

    const parsedBalance = isEdit || isDebit || isCredit ? 0 : parseFloat(openingBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError("Please enter a valid non-negative opening balance.");
      return;
    }

    const effectiveDate = openingDate.trim() || todayStr;
    const nowIso = new Date().toISOString();

    setIsSubmitting(true);
    setError(null);

    try {
      if (isDebit) {
        await saveDebitCard(user.id, digits);
        await invalidate(user.id);
        notify({ title: isEdit ? "Card updated" : "Debit card added" });
        resetForm();
        onOpenChange(false);
        return;
      }

      const type: Account["type"] = isCredit
        ? "credit"
        : accountType === "wallet"
          ? "wallet"
          : accountType === "cash"
            ? "cash"
            : "bank";
      const kindFields = {
        accountKind: accountType,
        creditLimit: isCredit ? limit : undefined,
        billDay: isCredit ? bill : undefined,
        dueDay: isCredit ? due : undefined,
      };

      if (editing && !editingDebit) {
        const updated: Account = {
          ...editing,
          ...kindFields,
          name: trimmedName,
          type,
          last4: digits ? digits.slice(-4) : undefined,
          updatedAt: nowIso,
        };
        await saveAccount(user.id, updated);
        await invalidate(user.id);
        notify({ title: "Account updated", description: `"${updated.name}" saved.` });
        onSuccess?.(updated);
        resetForm();
        onOpenChange(false);
        return;
      }

      const newAccount: Account = {
        id: crypto.randomUUID(),
        ...kindFields,
        name: trimmedName,
        type,
        last4: digits ? digits.slice(-4) : undefined,
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
      await invalidate(user.id);

      notify({
        title: "Account Created",
        description: `"${newAccount.name}" added to today's daily snapshot onward. Past snapshots remain unchanged.`,
      });

      onSuccess?.(newAccount);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save account:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const visibleTypes = ACCOUNT_TYPES.filter((item) =>
    !isEdit ? true : editingDebit ? item.type === "debit_card" : item.type !== "debit_card",
  );
  const needsLast4 = accountType !== "wallet" && accountType !== "cash";

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
                  {isEdit ? "Edit Account" : "Add New Account"}
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
                {visibleTypes.map((item) => {
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
            {accountType !== "debit_card" ? (
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
            ) : (
              <div className="space-y-2">
                <Label htmlFor="linked-bank" className="text-xs font-semibold text-foreground">
                  Linked Bank <span className="text-destructive">*</span>
                </Label>
                <select
                  id="linked-bank"
                  value={linkedBankId}
                  onChange={(e) => setLinkedBankId(e.target.value)}
                  className="h-9.5 w-full rounded-lg border border-input bg-transparent px-3 text-xs"
                >
                  <option value="">Select bank account</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.last4 ? ` ••${b.last4}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {accountType === "credit_card" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="credit-limit" className="text-xs font-semibold text-foreground">
                    Limit (₹)
                  </Label>
                  <Input
                    id="credit-limit"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Optional"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="h-9.5 text-xs font-mono rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill-day" className="text-xs font-semibold text-foreground">
                    Bill day
                  </Label>
                  <Input
                    id="bill-day"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1–31"
                    value={billDay}
                    onChange={(e) => setBillDay(e.target.value)}
                    className="h-9.5 text-xs font-mono rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-day" className="text-xs font-semibold text-foreground">
                    Due day
                  </Label>
                  <Input
                    id="due-day"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1–31"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="h-9.5 text-xs font-mono rounded-lg"
                  />
                </div>
              </div>
            ) : null}

            {/* Opening Balance & Opening Date Grid */}
            {!isEdit && (accountType === "bank" || accountType === "wallet") ? (
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
            ) : null}

            {/* Last 4 Digits (Optional for banks) */}
            {needsLast4 ? (
              <div className="space-y-2">
                <Label htmlFor="last4" className="text-xs font-semibold text-foreground">
                  Last 4 Digits <span className="text-destructive">*</span>
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
              disabled={isSubmitting || (accountType !== "debit_card" && !name.trim())}
              className="text-xs h-9 px-4 rounded-lg font-semibold shadow-xs gap-1.5 w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <PlusCircle className="size-3.5" />
                  {isEdit ? "Save Changes" : "Create Account"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
