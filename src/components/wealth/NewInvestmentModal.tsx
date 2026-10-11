"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
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
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestments } from "@/hooks/useInvestments";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/providers/toast-provider";
import { getDefaultPersonalPurpose } from "@/lib/purposes";
import {
  INVESTMENT_TX_CATEGORY,
  INVESTMENT_TYPE_LABELS,
  INVESTMENT_TYPES,
  parseAmountInput,
} from "@/lib/investments";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Bitcoin,
  Building,
  Coins,
  FileText,
  Gem,
  Home,
  LineChart,
  Loader2,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Investment, InvestmentAssetType } from "@/types";

export const INVESTMENT_TYPE_ICONS: Record<InvestmentAssetType, typeof LineChart> = {
  mutual_fund: TrendingUp,
  stocks: LineChart,
  fixed_deposit: Building,
  bonds: FileText,
  gold: Gem,
  crypto: Bitcoin,
  real_estate: Home,
  liquid: Wallet,
  other: PieChart,
};

type NewInvestmentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the modal edits this holding instead of creating one. */
  initialInvestment?: Investment | null;
  onSuccess?: (investment: Investment) => void;
};

type FieldErrors = Partial<Record<"name" | "invested" | "current" | "form", string>>;

function plain(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function NewInvestmentModal({
  open,
  onOpenChange,
  initialInvestment,
  onSuccess,
}: NewInvestmentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-2xl border bg-card">
        {open ? (
          // Mounted only while open so every open starts from fresh state.
          <InvestmentForm
            key={initialInvestment?.id ?? "new"}
            initialInvestment={initialInvestment ?? null}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InvestmentForm({
  initialInvestment,
  onOpenChange,
  onSuccess,
}: {
  initialInvestment: Investment | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (investment: Investment) => void;
}) {
  const { accounts } = useAccounts();
  const { purposes } = usePurposes();
  const { save } = useInvestments();
  const { addTransaction, deleteTransaction } = useTransactions();
  const { notify } = useToast();
  const isEditing = Boolean(initialInvestment);

  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.isActive !== false && (a.type === "bank" || a.type === "wallet"),
      ),
    [accounts],
  );
  const activePurposes = useMemo(
    () => purposes.filter((p) => p.isActive !== false && !p.deletedAt),
    [purposes],
  );
  const defaultPurposeName = getDefaultPersonalPurpose(activePurposes)?.name ?? "";

  const [name, setName] = useState(initialInvestment?.name ?? "");
  const [assetType, setAssetType] = useState<InvestmentAssetType>(
    initialInvestment?.type ?? "mutual_fund",
  );
  const [invested, setInvested] = useState(
    initialInvestment ? plain(initialInvestment.investedAmount) : "",
  );
  const [current, setCurrent] = useState(
    initialInvestment ? plain(initialInvestment.currentValue) : "",
  );
  const [purposeChoice, setPurposeChoice] = useState(initialInvestment?.purpose ?? "");
  const [sourceChoice, setSourceChoice] = useState("");
  const [deductFromBank, setDeductFromBank] = useState(!initialInvestment);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  });
  const [notes, setNotes] = useState(initialInvestment?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Accounts / purposes often load after the first render; derive defaults
  // instead of snapshotting them into state at mount time.
  const sourceAccount =
    sourceChoice && bankAccounts.some((a) => a.name === sourceChoice)
      ? sourceChoice
      : (bankAccounts.find((a) => a.type === "bank")?.name ?? bankAccounts[0]?.name ?? "");
  const purposeName = purposeChoice || defaultPurposeName;
  const setSourceAccount = setSourceChoice;
  const setPurposeName = setPurposeChoice;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const investedAmount = parseAmountInput(invested);
    const currentRaw = current.trim();
    const currentValue = currentRaw ? parseAmountInput(currentRaw) : investedAmount;
    const nextErrors: FieldErrors = {};
    if (!trimmedName) nextErrors.name = "Please enter an asset or fund name.";
    if (investedAmount === null) nextErrors.invested = "Enter a number, e.g. 25,000.";
    else if (investedAmount <= 0) nextErrors.invested = "Enter an amount greater than 0.";
    if (currentRaw && currentValue === null) nextErrors.current = "Enter a number, e.g. 27,500.";
    else if (currentValue !== null && currentValue < 0) nextErrors.current = "Value cannot be negative.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || investedAmount === null || currentValue === null) {
      return;
    }

    setIsSubmitting(true);
    let createdTxId: string | undefined;
    try {
      const id = initialInvestment?.id ?? crypto.randomUUID();
      const links = [...(initialInvestment?.sourceTransactionIds ?? [])];
      if (!isEditing && deductFromBank && sourceAccount) {
        const purposeId =
          activePurposes.find((p) => p.name === purposeName)?.id ??
          getDefaultPersonalPurpose(activePurposes)?.id ??
          "personal";

        const [hours, minutes] = (time || "12:00").split(":").map(Number);
        const txDateTime = new Date();
        if (date) {
          const [year, month, day] = date.split("-").map(Number);
          txDateTime.setFullYear(year, month - 1, day);
        }
        txDateTime.setHours(hours || 0, minutes || 0, 0, 0);
        const isoDate = txDateTime.toISOString();
        const timeString = format(txDateTime, "hh:mm a");

        const tx = await addTransaction({
          type: "expense",
          amount: investedAmount,
          totalAmount: investedAmount,
          merchant: trimmedName,
          category: INVESTMENT_TX_CATEGORY,
          account: sourceAccount,
          purpose: purposeId,
          source: "manual",
          date: isoDate,
          transactionDate: isoDate,
          time: timeString,
          note: notes.trim()
            ? `Investment in ${trimmedName}: ${notes.trim()}`
            : `Capital invested in ${trimmedName}`,
          tags: ["investment", `asset:${assetType}`, `investment:${id}`],
          paymentMethod: "Bank Transfer",
        });
        createdTxId = tx.id;
        links.push(tx.id);
      }

      const saved = await save({
        id,
        name: trimmedName,
        type: assetType,
        investedAmount,
        currentValue,
        accountId: initialInvestment?.accountId ?? null,
        purpose: purposeName || null,
        notes: notes.trim() || null,
        sourceTransactionIds: links,
        createdAt: initialInvestment?.createdAt,
        updatedAt: initialInvestment?.updatedAt,
      });

      notify({
        title: isEditing ? "Investment updated" : "Investment recorded 🚀",
        description: isEditing
          ? `"${trimmedName}" saved.`
          : `Deployed ${formatCurrency(investedAmount)} into ${trimmedName}.`,
      });
      onSuccess?.(saved);
      onOpenChange(false);
    } catch (err: unknown) {
      // Don't leave an orphan bank debit when the holding failed to save.
      if (createdTxId) {
        await deleteTransaction(createdTxId).catch(() => undefined);
      }
      setErrors({ form: err instanceof Error ? err.message : "Failed to save investment." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader className="p-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {isEditing ? "Edit Investment" : "Add Investment"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isEditing
                    ? "Update what you put in and what it is worth now."
                    : "Track mutual funds, stocks, deposits, gold and more."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-none">
            {errors.form ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {errors.form}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Asset Class</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {INVESTMENT_TYPES.map((type) => {
                  const Icon = INVESTMENT_TYPE_ICONS[type];
                  const isSelected = assetType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAssetType(type)}
                      className={cn(
                        "flex items-center gap-2 p-2 text-left rounded-xl border transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary text-foreground"
                          : "border-border hover:bg-muted/50 text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-lg shrink-0",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {INVESTMENT_TYPE_LABELS[type]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Investment Name *</Label>
              <Input
                placeholder="e.g. Parag Parikh Flexi Cap, SBI FD, Gold ETF"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                aria-invalid={Boolean(errors.name)}
                className={cn("h-10 text-sm rounded-xl", errors.name && "border-destructive")}
                autoFocus
              />
              {errors.name ? <p className="text-[11px] text-destructive">{errors.name}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount Invested (₹) *</Label>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 25,000"
                  value={invested}
                  onChange={(e) => {
                    setInvested(e.target.value);
                    if (errors.invested) setErrors((prev) => ({ ...prev, invested: undefined }));
                  }}
                  aria-invalid={Boolean(errors.invested)}
                  className={cn("h-10 text-sm font-semibold rounded-xl", errors.invested && "border-destructive")}
                />
                {errors.invested ? <p className="text-[11px] text-destructive">{errors.invested}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Current Value (₹)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Same as invested"
                  value={current}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    if (errors.current) setErrors((prev) => ({ ...prev, current: undefined }));
                  }}
                  aria-invalid={Boolean(errors.current)}
                  className={cn("h-10 text-sm font-semibold rounded-xl", errors.current && "border-destructive")}
                />
                {errors.current ? <p className="text-[11px] text-destructive">{errors.current}</p> : null}
              </div>
            </div>

            {activePurposes.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Purpose</Label>
                <select
                  value={purposeName}
                  onChange={(e) => setPurposeName(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border bg-background text-foreground"
                >
                  {purposeName && !activePurposes.some((p) => p.name === purposeName) ? (
                    <option value={purposeName}>{purposeName}</option>
                  ) : null}
                  {activePurposes.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {!isEditing ? (
              <>
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30 border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deductFromBank && bankAccounts.length > 0}
                    disabled={bankAccounts.length === 0}
                    onChange={(e) => setDeductFromBank(e.target.checked)}
                    className="mt-0.5 rounded text-primary"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">Deduct from bank balance</p>
                    <p className="text-muted-foreground mt-0.5">
                      Records a linked &quot;{INVESTMENT_TX_CATEGORY}&quot; transaction (counted once in totals).
                    </p>
                  </div>
                </label>
                {deductFromBank && bankAccounts.length > 0 ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Paid from</Label>
                      <select
                        value={sourceAccount}
                        onChange={(e) => setSourceAccount(e.target.value)}
                        className="w-full h-10 px-3 text-sm rounded-xl border bg-background text-foreground"
                      >
                        {bankAccounts.map((acc) => (
                          <option key={acc.id} value={acc.name}>
                            {acc.name} ({acc.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Date</Label>
                        <Input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="h-10 text-xs rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Time</Label>
                        <Input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="h-10 text-xs rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Input
                placeholder="e.g. Folio #12345678, SIP monthly"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
            <Button type="submit" size="sm" disabled={isSubmitting} className="rounded-xl gap-2 font-medium">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Coins className="size-3.5" />
                  {isEditing ? "Save Changes" : "Add Investment"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
  );
}
