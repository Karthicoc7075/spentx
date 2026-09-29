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
import { InlineIconPicker, InlineColorPicker, saveCustomPaletteColor } from "@/components/shared/IconPicker";
import { getCategoryIcon } from "@/lib/transaction-ui";

type AddCategoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, color?: string, icon?: string) => void;
};

export function AddCategoryModal({
  open,
  onOpenChange,
  onAdd,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#10b981");
  const [icon, setIcon] = useState("ShoppingBag");

  const PreviewIcon = getCategoryIcon(icon || name);

  function handleAdd() {
    if (!name.trim()) return;
    saveCustomPaletteColor(color);
    onAdd(name.trim(), color, icon);
    setName("");
    setColor("#10b981");
    setIcon("ShoppingBag");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="text-sm font-bold">
            Add Spending Category
          </DialogTitle>
        </DialogHeader>

        {/* Hero Section */}
        <div className="flex items-center gap-3 pt-1">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors"
            style={{
              backgroundColor: `${color}20`,
              color,
            }}
          >
            <PreviewIcon className="size-6" />
          </div>

          <div className="flex-1">
            <Input
              id="plan-category-name"
              placeholder="Category name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 text-sm font-semibold rounded-xl bg-muted/20 border-border/70"
              autoFocus
            />
          </div>
        </div>

        {/* Color Swatches */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Color
          </span>
          <InlineColorPicker value={color} onChange={setColor} />
        </div>

        {/* Icon Picker */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Icon
          </span>
          <InlineIconPicker value={icon} onChange={setIcon} color={color} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl cursor-pointer"
            onClick={handleAdd}
          >
            Add category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}