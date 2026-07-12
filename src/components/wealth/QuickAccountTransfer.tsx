"use client";

import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
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
import type { Account } from "@/types";

type QuickAccountTransferProps = {
  accounts: Account[];
  onTransfer: (args: {
    fromAccount: string;
    toAccount: string;
    amount: number;
    date: string;
  }) => Promise<void>;
};

export function QuickAccountTransfer({
  accounts,
  onTransfer,
}: QuickAccountTransferProps) {
  const [open, setOpen] = useState(false);
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const transferableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.type === "bank" || account.type === "cash" || account.type === "wallet",
      ),
    [accounts],
  );

  async function handleSubmit() {
    const parsedAmount = Number(amount);
    if (!fromAccount || !toAccount || parsedAmount <= 0 || fromAccount === toAccount) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onTransfer({
        fromAccount,
        toAccount,
        amount: parsedAmount,
        date: new Date().toISOString().slice(0, 10),
      });
      setOpen(false);
      setAmount("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <ArrowLeftRight className="size-4" />
        Transfer between accounts
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer between accounts</DialogTitle>
            <DialogDescription>
              Move money between accounts without changing your net worth.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>From account</Label>
              <select
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={fromAccount}
                onChange={(event) => setFromAccount(event.target.value)}
              >
                <option value="">Select account</option>
                {transferableAccounts.map((account) => (
                  <option key={account.id} value={account.name}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label>To account</Label>
              <select
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={toAccount}
                onChange={(event) => setToAccount(event.target.value)}
              >
                <option value="">Select account</option>
                {transferableAccounts
                  .filter((account) => account.name !== fromAccount)
                  .map((account) => (
                    <option key={account.id} value={account.name}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={
                isSubmitting ||
                !fromAccount ||
                !toAccount ||
                fromAccount === toAccount ||
                Number(amount) <= 0
              }
              onClick={handleSubmit}
            >
              Record transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}