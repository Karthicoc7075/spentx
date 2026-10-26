"use client";

import { useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/providers/toast-provider";
import { accountColor, isCreditCard } from "@/lib/account-kinds";
import { getTodayCalendarDate } from "@/lib/date-filters";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/types";

type TransferFormProps = {
  accounts: Account[];
  onDone: () => void;
};

function AccountPicker({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Account[];
  placeholder: string;
}) {
  const selected = options.find((a) => a.name === value);
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
      <SelectTrigger className="h-10 w-full">
        {selected ? (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accountColor(selected) }}
          />
        ) : null}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.name}>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: accountColor(a) }}
            />
            {a.name}
            {isCreditCard(a) ? " · Card bill" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Transfer between own accounts; To may be a credit card (bill payment).
 * Recorded as expense + income legs tagged "transfer" — never counted as spend. */
export function TransferForm({ accounts, onDone }: TransferFormProps) {
  const { addTransaction } = useTransactions();
  const { notify } = useToast();
  const active = accounts.filter((a) => a.isActive !== false);
  const fromOptions = active.filter(
    (a) => a.type === "bank" || a.type === "cash" || a.type === "wallet",
  );
  const [from, setFrom] = useState(
    fromOptions.find((a) => a.isDefault)?.name ?? fromOptions[0]?.name ?? "",
  );
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayCalendarDate());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const toOptions = active.filter(
    (a) =>
      a.name !== from &&
      (a.type === "bank" || a.type === "cash" || a.type === "wallet" || a.type === "credit"),
  );
  const parsed = Number(amount);
  const valid = Boolean(from && to && from !== to && parsed > 0);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const toCard = active.find((a) => a.name === to && isCreditCard(a));
      const iso = new Date(date).toISOString();
      const tags = ["transfer", `transfer_to:${to}`];
      await addTransaction({
        type: "expense",
        amount: parsed,
        totalAmount: parsed,
        merchant: toCard ? `Card bill · ${to}` : `Transfer to ${to}`,
        category: "Settlements",
        account: from,
        purpose: "personal",
        source: "manual",
        date: iso,
        note: note.trim() || `Internal transfer to ${to}`,
        tags,
        paymentMethod: "UPI",
      });
      await addTransaction({
        type: "income",
        amount: parsed,
        totalAmount: parsed,
        merchant: `Transfer from ${from}`,
        category: "Settlements",
        account: to,
        purpose: "personal",
        source: "manual",
        date: iso,
        note: note.trim() || `Internal transfer from ${from}`,
        tags,
        paymentMethod: "UPI",
      });
      notify({
        title: toCard ? "Card bill paid" : "Transfer recorded",
        description: `${formatCurrency(parsed)} from ${from} to ${to}.`,
      });
      onDone();
    } catch (err) {
      notify({
        title: "Couldn't record transfer",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">From account</Label>
        <AccountPicker value={from} onChange={setFrom} options={fromOptions} placeholder="Select account" />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">To account</Label>
        <AccountPicker value={to} onChange={setTo} options={toOptions} placeholder="Select account or card" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Amount (₹)</Label>
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            max={getTodayCalendarDate()}
            onChange={(e) => setDate(e.target.value)}
            className="h-10"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Note</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-10" />
      </div>
      <p className="text-xs text-muted-foreground">
        Transfers and card bill payments move money between your accounts and are not counted as spend.
      </p>
      <Button type="button" disabled={!valid || saving} onClick={() => void submit()} className="gap-2">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeftRight className="size-4" />}
        Record transfer
      </Button>
    </div>
  );
}
