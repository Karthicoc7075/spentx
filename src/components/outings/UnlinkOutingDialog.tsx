"use client";

import { useState } from "react";
import { Split, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** What the user chose to do with the transaction after unlinking. */
export type UnlinkOutingChoice = "normal" | "split";

type UnlinkOutingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Trip the transaction is currently attached to — shown for context. */
  outingName?: string;
  onConfirm: (choice: UnlinkOutingChoice) => void;
};

const options: Array<{
  value: UnlinkOutingChoice;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    value: "normal",
    label: "Convert to Normal Transaction",
    description: "Keeps its own category and purpose, out of the trip.",
    icon: UserRound,
  },
  {
    value: "split",
    label: "Convert to Split Transaction",
    description: "Opens Split Expense so you can divide it by purpose or category.",
    icon: Split,
  },
];

/**
 * Shared confirm for unlinking an automatically linked transaction from an
 * outing. Both choices unlink identically (clear outing_id, delete the linked
 * outing expense, tag `outing-unlinked` so auto-add never reattaches it) —
 * "split" additionally hands the caller a signal to open the Split Expense
 * form on that same transaction.
 */
export function UnlinkOutingDialog({
  open,
  onOpenChange,
  outingName,
  onConfirm,
}: UnlinkOutingDialogProps) {
  const [choice, setChoice] = useState<UnlinkOutingChoice>("normal");

  /** Always reopen on the default option rather than the last one used. */
  function close() {
    setChoice("normal");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unlink Transaction</DialogTitle>
          <DialogDescription>
            {outingName
              ? `This transaction is linked to ${outingName}. Choose what you want to do.`
              : "This transaction is linked to an outing. Choose what you want to do."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-1">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = choice === option.value;
            return (
              <button
                key={option.value}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
                type="button"
                onClick={() => setChoice(option.value)}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-primary" : "border-muted-foreground/50",
                  )}
                >
                  {selected ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Icon className="size-3.5" />
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const selected = choice;
              setChoice("normal");
              onConfirm(selected);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
