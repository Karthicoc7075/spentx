"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeFriendUpis } from "@/lib/supabase-data";
import { cn } from "@/lib/utils";
import type { Friend } from "@/types";

export type FriendFormValues = {
  name: string;
  phone?: string;
  upiId?: string;
  upiIds: string[];
  notes?: string;
};

type FriendFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = Edit mode; the form pre-fills and the copy switches. */
  friend?: Friend | null;
  onSubmit: (values: FriendFormValues) => Promise<void> | void;
};

/** Loose on purpose — catches typos without rejecting valid Indian formats. */
const PHONE_PATTERN = /^\+?[\d\s-]{7,15}$/;
const UPI_PATTERN = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

/**
 * The single Add / Edit Friend modal. Same fields both ways — only the title
 * and the confirm button change.
 */
export function FriendFormDialog({
  open,
  onOpenChange,
  friend,
  onSubmit,
}: FriendFormDialogProps) {
  const isEdit = Boolean(friend);

  // Seeded once per mount — the parent remounts this on each open, so a
  // cancelled edit never leaves residue behind.
  const [name, setName] = useState(friend?.name ?? "");
  const [phone, setPhone] = useState(friend?.phone ?? "");
  const [notes, setNotes] = useState(friend?.notes ?? "");
  const [upiIds, setUpiIds] = useState<string[]>(() =>
    friend ? normalizeFriendUpis(friend).upiIds : [],
  );
  const [upiDraft, setUpiDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function addUpiDraft() {
    const value = upiDraft.trim();
    if (!value) return;
    if (!UPI_PATTERN.test(value)) {
      setErrors((current) => ({
        ...current,
        upi: "Enter a valid UPI ID, e.g. name@bank.",
      }));
      return;
    }
    const { upiIds: next } = normalizeFriendUpis({ upiIds: [...upiIds, value] });
    setUpiIds(next);
    setUpiDraft("");
    setErrors((current) => ({ ...current, upi: "" }));
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Friend name is required.";
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
      next.phone = "Enter a valid phone number.";
    }
    // An unconfirmed draft would otherwise be silently dropped on save.
    if (upiDraft.trim() && !UPI_PATTERN.test(upiDraft.trim())) {
      next.upi = "Enter a valid UPI ID, e.g. name@bank.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    // Fold a valid, un-added draft in rather than losing it.
    const pending = upiDraft.trim();
    const merged = pending ? [...upiIds, pending] : upiIds;
    const normalized = normalizeFriendUpis({ upiIds: merged });

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        upiId: normalized.upiId,
        upiIds: normalized.upiIds,
        notes: notes.trim() || undefined,
      });
      // Only dismiss once the save actually succeeded — a failed write must
      // not look like a successful one.
      onOpenChange(false);
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Couldn't save this friend. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Friend" : "Add Friend"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="friend-name">
              Friend Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="friend-name"
              autoFocus
              placeholder="Friend name"
              value={name}
              aria-invalid={Boolean(errors.name)}
              className={cn(errors.name && "border-destructive")}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((c) => ({ ...c, name: "" }));
              }}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="friend-phone">Phone Number</Label>
            <Input
              id="friend-phone"
              placeholder="+91..."
              value={phone}
              aria-invalid={Boolean(errors.phone)}
              className={cn(errors.phone && "border-destructive")}
              onChange={(event) => {
                setPhone(event.target.value);
                if (errors.phone) setErrors((c) => ({ ...c, phone: "" }));
              }}
            />
            {errors.phone ? (
              <p className="text-xs text-destructive">{errors.phone}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="friend-upi">UPI IDs</Label>
            {upiIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {upiIds.map((upi) => (
                  <span
                    key={upi.toLowerCase()}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span className="truncate">{upi}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${upi}`}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() =>
                        setUpiIds((current) =>
                          current.filter(
                            (x) => x.toLowerCase() !== upi.toLowerCase(),
                          ),
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="friend-upi"
                className={cn("flex-1", errors.upi && "border-destructive")}
                placeholder="name@bank"
                value={upiDraft}
                aria-invalid={Boolean(errors.upi)}
                onChange={(event) => {
                  setUpiDraft(event.target.value);
                  if (errors.upi) setErrors((c) => ({ ...c, upi: "" }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addUpiDraft();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!upiDraft.trim()}
                onClick={addUpiDraft}
              >
                <Plus className="size-3.5" />
                Add Another
              </Button>
            </div>
            {errors.upi ? (
              <p className="text-xs text-destructive">{errors.upi}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="friend-notes">Notes</Label>
            <Textarea
              id="friend-notes"
              rows={3}
              placeholder="Optional"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        {errors.form ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.form}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting
              ? "Saving…"
              : isEdit
                ? "Save Changes"
                : "Save Friend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
