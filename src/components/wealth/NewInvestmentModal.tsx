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
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/providers/toast-provider";
import { useQueryClient } from "@tanstack/react-query";
import { saveAccount } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Briefcase,
  Building,
  Coins,
  Gem,
  Landmark,
  LineChart,
  Loader2,
  TrendingUp,
} from "lucide-react";
import type { Account } from "@/types";

type AssetTypeOption = {
  type: Account["type"];
  label: string;
  icon: typeof LineChart;
  description: string;
};

const ASSET_TYPES: AssetTypeOption[] = [
  {
    type: "mutual_fund",
    label: "Mutual Fund",
    icon: TrendingUp,
    description: "SIP or lumpsum equity/debt fund",
  },
  {
    type: "stocks",
    label: "Stocks & Equity",
    icon: LineChart,
    description: "Direct equity holdings / Demat",
  },
  {
    type: "investment",
    label: "Fixed Deposit / Bonds",
    icon: Building,
    description: "FD, RD, Government bonds",
  },
  {
    type: "investment",
    label: "Gold / Commodities",
    icon: Gem,
    description: "Sovereign Gold Bonds, digital gold",
  },
];

type NewInvestmentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAccount?: Account | null;
  onSuccess?: (account: Account) => void;
};

export function NewInvestmentModal({
  open,
  onOpenChange,
  initialAccount,
  onSuccess,
}: NewInvestmentModalProps) {
  const { user } = useAuthReady();
  const { accounts } = useAccounts();
  const { addTransaction } = useTransactions();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<Account["type"]>("mutual_fund");
  const [selectedAssetLabel, setSelectedAssetLabel] = useState("Mutual Fund");
  const [amount, setAmount] = useState("");
  const [sourceAccount, setSourceAccount] = useState(
    accounts.find((a) => a.type === "bank")?.name || "",
  );
  const [deductFromBank, setDeductFromBank] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialAccount) {
      setName(initialAccount.name);
      setAssetType(initialAccount.type);
      const match = ASSET_TYPES.find((t) => t.type === initialAccount.type);
      setSelectedAssetLabel(match?.label || "Mutual Fund");
      setAmount(initialAccount.openingBalance ? initialAccount.openingBalance.toString() : "");
      setDate(initialAccount.openingBalanceDate || new Date().toISOString().slice(0, 10));
      setDeductFromBank(false); // don't re-debit when just editing details
    } else {
      resetForm();
    }
  }, [initialAccount, open]);

  const bankAccounts = accounts.filter(
    (a) => a.type === "bank" || a.type === "wallet",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) {
      setError("Please sign in to record investments.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter an asset or fund name (e.g., 'HDFC Top 100 Index').");
      return;
    }

    const investAmount = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (isNaN(investAmount) || investAmount <= 0) {
      setError("Please enter a valid investment amount.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create or upsert investment account
      const savedAcc = await saveAccount(user.id, {
        id: initialAccount?.id || crypto.randomUUID(),
        name: trimmedName,
        type: assetType,
        openingBalance: investAmount,
        openingBalanceDate: date,
        isActive: true,
      });

      // 2. Optionally record deduction transaction from source bank account
      if (deductFromBank && sourceAccount) {
        await addTransaction({
          type: "expense",
          amount: investAmount,
          totalAmount: investAmount,
          merchant: trimmedName,
          category: "Investments",
          account: sourceAccount,
          purpose: "personal",
          source: "manual",
          date: new Date(date).toISOString(),
          note: note ? `Investment in ${trimmedName}: ${note}` : `Capital invested in ${trimmedName}`,
          tags: ["investment", `asset:${assetType}`],
          paymentMethod: "Bank Transfer",
        });
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(user.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.investmentTotal(user.id) });
      await invalidateFinancialData(queryClient, user.id);

      notify({
        title: "Investment recorded! 🚀",
        description: `Deployed ${formatCurrency(investAmount)} into ${trimmedName}.`,
      });

      if (onSuccess) onSuccess(savedAcc);
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record investment.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setName("");
    setAssetType("mutual_fund");
    setSelectedAssetLabel("Mutual Fund");
    setAmount("");
    setDeductFromBank(true);
    setNote("");
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-2xl border bg-card">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="p-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Add Investment Asset
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Track capital deployed across mutual funds, stocks, bonds and gold.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-none">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {/* Asset Type Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Asset Class</Label>
              <div className="grid grid-cols-2 gap-2">
                {ASSET_TYPES.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedAssetLabel === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setAssetType(opt.type);
                        setSelectedAssetLabel(opt.label);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 text-left rounded-xl border transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary text-foreground"
                          : "border-border hover:bg-muted/50 text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-lg shrink-0",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {opt.label}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Asset / Fund Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Investment Name *</Label>
              <Input
                placeholder="e.g. Parag Parikh Flexi Cap, Zerodha Demat, SBI FD"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-sm rounded-xl"
                autoFocus
              />
            </div>

            {/* Amount & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount Invested (₹) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 25000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 text-sm font-semibold rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Investment Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Funding Source Bank */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Funding Source Account</Label>
              <select
                value={sourceAccount}
                onChange={(e) => setSourceAccount(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-xl border bg-background text-foreground"
              >
                {bankAccounts.length === 0 ? (
                  <option value="">No bank accounts found</option>
                ) : (
                  bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.name}>
                      {acc.name} ({acc.type})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Deduct from bank checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border cursor-pointer">
              <input
                type="checkbox"
                checked={deductFromBank}
                onChange={(e) => setDeductFromBank(e.target.checked)}
                className="mt-0.5 rounded text-primary"
              />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Record debit from bank account</p>
                <p className="text-muted-foreground mt-0.5">
                  Records an investment transaction under Settlements / Investments so bank balance adjusts correctly.
                </p>
              </div>
            </label>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Folio / Demat Note (Optional)</Label>
              <Input
                placeholder="e.g. Folio #12345678, SIP monthly"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>
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
                  <TrendingUp className="size-3.5" />
                  Add Investment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
