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

type AddCategoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string) => void;
};

export function AddCategoryModal({
  open,
  onOpenChange,
  onAdd,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
          <DialogDescription>
            Add a new spending category to your monthly intentional plan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="plan-category-name">Category name</Label>
          <Input
            id="plan-category-name"
            placeholder="Travel, Education, Gifts..."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd}>Add category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}