"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";
import type { Outing, SplitType } from "@/types";

type AddOutingExpenseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outing: Outing;
  onSubmit: (values: {
    description: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: SplitType;
    date: string;
  }) => Promise<void>;
};

export function AddOutingExpenseDialog({
  open,
  onOpenChange,
  outing,
  onSubmit,
}: AddOutingExpenseDialogProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [paidBy, setPaidBy] = useState(
    outing.members.find((member) => member.isCurrentUser)?.id ??
      outing.members[0]?.id ??
      "",
  );
  const [splitType, setSplitType] = useState<SplitType>("equally");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || !parsedAmount || !paidBy) return;

    setSubmitting(true);
    try {
      await onSubmit({
        description: description.trim(),
        amount: parsedAmount,
        category,
        paidByMemberId: paidBy,
        splitType,
        date: new Date().toISOString().slice(0, 10),
      });
      setDescription("");
      setAmount("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Record an expense for {outing.name}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Dinner, taxi, tickets..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Paid by</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={paidBy}
              onChange={(event) => setPaidBy(event.target.value)}
            >
              {outing.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["equally", "solo", "custom"] as SplitType[]).map((type) => (
              <button
                key={type}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs capitalize",
                  splitType === type
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
                type="button"
                onClick={() => setSplitType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={submitting} type="submit">
              Add expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}