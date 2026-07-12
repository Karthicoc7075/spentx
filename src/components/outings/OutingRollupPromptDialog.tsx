"use client";

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type OutingRollupPromptDialogProps = {
  open: boolean;
  outingName: string;
  yourShare: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function OutingRollupPromptDialog({
  open,
  outingName,
  yourShare,
  onOpenChange,
  onConfirm,
}: OutingRollupPromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            Log your share?
          </DialogTitle>
          <DialogDescription>
            Settlement recorded for <span className="font-medium">{outingName}</span>.
            Add your share ({formatCurrency(yourShare)}) as a personal transaction so it
            appears in Dashboard and Analytics?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button type="button" onClick={onConfirm}>
            Log transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}