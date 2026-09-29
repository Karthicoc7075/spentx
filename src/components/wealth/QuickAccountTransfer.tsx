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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultFromAccount?: string;
  hideTriggerButton?: boolean;
};

export function QuickAccountTransfer({
  accounts,
  onTransfer,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  defaultFromAccount,
  hideTriggerButton = false,
}: QuickAccountTransferProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isDialogOpen = isControlled ? controlledOpen : internalOpen;
  const setIsDialogOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const [fromAccount, setFromAccount] = useState(defaultFromAccount ?? "");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync defaultFromAccount when it changes
  useMemo(() => {
    if (defaultFromAccount) {
      setFromAccount(defaultFromAccount);
    }
  }, [defaultFromAccount]);

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
      setIsDialogOpen(false);
      setAmount("");
    } catch {
      // Error toast is already shown by the onTransfer handler; keep the
      // dialog open so the user can retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {!hideTriggerButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs font-medium w-full sm:w-auto"
          onClick={() => {
            if (defaultFromAccount) setFromAccount(defaultFromAccount);
            setIsDialogOpen(true);
          }}
        >
          <ArrowLeftRight className="size-3.5 text-muted-foreground" />
          Quick Transfer
        </Button>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[calc(100%-1.5rem)] sm:w-full max-w-md p-0 gap-0 overflow-hidden rounded-2xl border border-border shadow-xl bg-card"
        >
          <DialogHeader className="px-4.5 py-4 sm:px-5 sm:py-4.5 border-b border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <ArrowLeftRight className="size-4.5 sm:size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                  Transfer Between Accounts
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
                  Move money between accounts without altering your net worth.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-4.5 sm:p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                From Account
              </Label>
              <select
                className="w-full h-9.5 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={fromAccount}
                onChange={(event) => setFromAccount(event.target.value)}
              >
                <option value="">Select source account</option>
                {transferableAccounts.map((account) => (
                  <option key={account.id} value={account.name}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                To Account
              </Label>
              <select
                className="w-full h-9.5 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={toAccount}
                onChange={(event) => setToAccount(event.target.value)}
              >
                <option value="">Select destination account</option>
                {transferableAccounts
                  .filter((account) => account.name !== fromAccount)
                  .map((account) => (
                    <option key={account.id} value={account.name}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Amount (₹)
              </Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  ₹
                </span>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value.replace(/\D/g, ""))
                  }
                  className="pl-8 h-9.5 text-xs font-mono rounded-lg"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-border bg-muted/20 px-4.5 py-3 sm:px-5 sm:py-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs rounded-lg w-full sm:w-auto font-medium"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 text-xs rounded-lg font-semibold w-full sm:w-auto gap-1.5 shadow-xs"
              disabled={
                isSubmitting ||
                !fromAccount ||
                !toAccount ||
                fromAccount === toAccount ||
                Number(amount) <= 0
              }
              onClick={handleSubmit}
            >
              {isSubmitting ? "Recording..." : "Record Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}