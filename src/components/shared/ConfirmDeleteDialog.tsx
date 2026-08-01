"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What's being deleted, e.g. "Transaction" — titles the dialog "Delete Transaction?". */
  itemLabel?: string;
  /** Overrides the generated body copy when a record deletes more than itself. */
  description?: string;
  /** Extra line under the description, e.g. the record's name. */
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

/**
 * The one delete confirmation used across the app. Every permanent delete goes
 * through this so the wording, button order and destructive styling match.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  itemLabel = "Item",
  description,
  detail,
  confirmLabel = "Delete",
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const body =
    description ??
    `Are you sure you want to delete this ${itemLabel.toLowerCase()}?`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {itemLabel}?</DialogTitle>
          <DialogDescription>
            {body} This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {detail ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
            {detail}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
