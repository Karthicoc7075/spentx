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
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { Calendar, Check, Infinity as InfinityIcon, Loader2, Sparkles, Target } from "lucide-react";
import type { SavingsGoal } from "@/types";

const PRESET_ICONS = [
  { emoji: "🏍️", label: "Bike" },
  { emoji: "✈️", label: "Travel" },
  { emoji: "💻", label: "Laptop" },
  { emoji: "🏠", label: "House" },
  { emoji: "🚗", label: "Car" },
  { emoji: "💍", label: "Wedding" },
  { emoji: "🎓", label: "Education" },
  { emoji: "🛡️", label: "Safety" },
  { emoji: "🎯", label: "Target" },
  { emoji: "💰", label: "Savings" },
  { emoji: "📱", label: "Gadget" },
  { emoji: "🏖️", label: "Vacation" },
];

const PRESET_COLORS = [
  { id: "indigo", name: "Indigo", bgClass: "bg-indigo-500", textClass: "text-indigo-500" },
  { id: "emerald", name: "Mint", bgClass: "bg-emerald-500", textClass: "text-emerald-500" },
  { id: "amber", name: "Amber", bgClass: "bg-amber-500", textClass: "text-amber-500" },
  { id: "rose", name: "Rose", bgClass: "bg-rose-500", textClass: "text-rose-500" },
  { id: "sky", name: "Sky", bgClass: "bg-sky-500", textClass: "text-sky-500" },
  { id: "violet", name: "Violet", bgClass: "bg-violet-500", textClass: "text-violet-500" },
];

type NewSavingsGoalModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGoal?: SavingsGoal | null;
  onSuccess?: (goal: SavingsGoal) => void;
};

export function NewSavingsGoalModal({
  open,
  onOpenChange,
  initialGoal,
  onSuccess,
}: NewSavingsGoalModalProps) {
  const { addGoal, updateGoal } = useSavingsGoals();
  const { notify } = useToast();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("0");
  const [hasDeadline, setHasDeadline] = useState(true);
  const [targetDate, setTargetDate] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("🎯");
  const [selectedColor, setSelectedColor] = useState("indigo");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialGoal) {
      setName(initialGoal.name);
      setTargetAmount(initialGoal.targetAmount.toString());
      setSavedAmount((initialGoal.savedAmount || 0).toString());
      setSelectedIcon(initialGoal.icon || "🎯");
      setSelectedColor(initialGoal.color || "indigo");
      if (initialGoal.targetDate) {
        setHasDeadline(true);
        setTargetDate(initialGoal.targetDate.slice(0, 10));
      } else {
        setHasDeadline(false);
        setTargetDate("");
      }
    } else {
      setName("");
      setTargetAmount("");
      setSavedAmount("0");
      setHasDeadline(false);
      setTargetDate("");
      setSelectedIcon("🎯");
      setSelectedColor("indigo");
    }
    setError(null);
  }, [initialGoal, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please provide a goal name (e.g., 'New Bike').");
      return;
    }

    const targetVal = parseFloat(targetAmount.replace(/[^0-9.]/g, ""));
    if (isNaN(targetVal) || targetVal <= 0) {
      setError("Target amount must be greater than zero.");
      return;
    }

    const savedVal = parseFloat(savedAmount.replace(/[^0-9.]/g, "")) || 0;

    setIsSubmitting(true);
    setError(null);

    try {
      if (initialGoal) {
        const updated = await updateGoal({
          ...initialGoal,
          name: trimmedName,
          targetAmount: targetVal,
          savedAmount: savedVal,
          targetDate: hasDeadline && targetDate ? targetDate : undefined,
          icon: selectedIcon,
          color: selectedColor,
        });
        notify({
          title: "Goal updated",
          description: `"${trimmedName}" details saved successfully.`,
        });
        if (updated && onSuccess) onSuccess(updated);
      } else {
        const created = await addGoal({
          name: trimmedName,
          targetAmount: targetVal,
          savedAmount: savedVal,
          targetDate: hasDeadline && targetDate ? targetDate : undefined,
          icon: selectedIcon,
          color: selectedColor,
          isActive: true,
        });
        notify({
          title: "Goal created",
          description: `"${trimmedName}" target set for ₹${targetVal.toLocaleString("en-IN")}.`,
        });
        if (created && onSuccess) onSuccess(created);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save goal.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-2xl border bg-card">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="p-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-xl">
                {selectedIcon}
              </span>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {initialGoal ? "Edit Savings Goal" : "New Savings Goal"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Set target amount, icon, color and timeline for your savings.
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

            {/* Goal Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Goal Name *</Label>
              <Input
                placeholder="e.g. New Bike, Goa Trip, Emergency Pot"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 text-sm rounded-xl"
                autoFocus
              />
            </div>

            {/* Target and Initial Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Target Amount (₹) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 80000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="h-10 text-sm font-semibold rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Current Saved (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={savedAmount}
                  onChange={(e) => setSavedAmount(e.target.value)}
                  className="h-10 text-sm rounded-xl"
                />
              </div>
            </div>

            {/* Target Date vs Any Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Timeline</Label>
                <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setHasDeadline(false)}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1",
                      !hasDeadline ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground",
                    )}
                  >
                    <InfinityIcon className="size-3" /> Any time
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasDeadline(true)}
                    className={cn(
                      "px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1",
                      hasDeadline ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground",
                    )}
                  >
                    <Calendar className="size-3" /> Target Date
                  </button>
                </div>
              </div>

              {hasDeadline ? (
                <div className="space-y-1 pt-1">
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="h-10 text-xs rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    SpentX calculates required monthly savings based on target date.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-dashed">
                  No fixed deadline. You can save at your own pace anytime.
                </p>
              )}
            </div>

            {/* Icon Picker */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Icon / Emoji</span>
                <span className="text-[11px] font-normal text-muted-foreground">Selected: {selectedIcon}</span>
              </Label>
              <div className="grid grid-cols-6 gap-2 p-2 rounded-xl bg-muted/30 border">
                {PRESET_ICONS.map((item) => (
                  <button
                    key={item.emoji}
                    type="button"
                    title={item.label}
                    onClick={() => setSelectedIcon(item.emoji)}
                    className={cn(
                      "h-9 flex items-center justify-center rounded-lg text-lg transition-all hover:scale-110",
                      selectedIcon === item.emoji
                        ? "bg-primary/20 ring-2 ring-primary scale-105"
                        : "hover:bg-muted",
                    )}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Theme Color</Label>
              <div className="flex items-center gap-3">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setSelectedColor(col.id)}
                    className={cn(
                      "size-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                      col.bgClass,
                      selectedColor === col.id
                        ? "ring-2 ring-offset-2 ring-foreground/60 scale-110"
                        : "opacity-80 hover:opacity-100",
                    )}
                    title={col.name}
                  >
                    {selectedColor === col.id ? (
                      <Check className="size-4 text-white stroke-[3]" />
                    ) : null}
                  </button>
                ))}
              </div>
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
                  Saving...
                </>
              ) : initialGoal ? (
                "Save Changes"
              ) : (
                "Create Goal"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
