"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
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
import { useOutingCategories } from "@/hooks/useOutingCategories";
import { usePurposes } from "@/hooks/usePurposes";
import { getActivePurposes, getDefaultPersonalPurpose } from "@/lib/purposes";
import { cn } from "@/lib/utils";
import type { Friend, Outing, TripMember } from "@/types";

/** Shared member shape with mobile OutingMember / TripMember. */
function makeYouMember(): TripMember {
  return { id: crypto.randomUUID(), name: "You", isCurrentUser: true };
}

function memberFromFriend(friend: Friend): TripMember {
  return {
    id: crypto.randomUUID(),
    name: friend.name,
    friendId: friend.id,
    upiId: friend.upiId ?? friend.upiIds?.[0],
    isCurrentUser: false,
  };
}

type CreateOutingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  /** When set, the modal edits this outing's details instead of creating a
   * new one — member roster is carried over unchanged (editing membership
   * risks orphaning existing expense/settlement references) and the "Add
   * members" section is hidden. Pass `key={initialValues?.id ?? "new"}` at
   * the call site so switching context remounts instead of reusing state. */
  initialValues?: Outing;
  onSubmit: (
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) => Promise<unknown>;
};

export function CreateOutingModal({
  open,
  onOpenChange,
  friends,
  initialValues,
  onSubmit,
}: CreateOutingModalProps) {
  const isEditing = Boolean(initialValues);
  const { categories: remoteCategories, addCategory } = useOutingCategories();
  const { purposes } = usePurposes();
  const activePurposes = useMemo(() => getActivePurposes(purposes), [purposes]);
  const defaultPurposeId = useMemo(
    () => getDefaultPersonalPurpose(activePurposes)?.id,
    [activePurposes],
  );
  const [name, setName] = useState(initialValues?.name ?? "");
  const [category, setCategory] = useState<string>(initialValues?.category ?? "Trip");
  const [purposeId, setPurposeId] = useState<string | undefined>(initialValues?.purposeId);
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [budget, setBudget] = useState(initialValues?.budget?.toString() ?? "");
  const [startDate, setStartDate] = useState(
    initialValues?.startDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(initialValues?.endDate?.slice(0, 10) ?? "");
  /** Same model as mobile: You + friends (id, name, friendId, upiId, isCurrentUser). */
  const [members, setMembers] = useState<TripMember[]>(
    initialValues?.members?.length
      ? initialValues.members
      : [makeYouMember()],
  );
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(remoteCategories);
    if (initialValues?.category) set.add(initialValues.category);
    if (category) set.add(category);
    // Keep Other last when present.
    const list = [...set].filter(Boolean);
    list.sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    return list;
  }, [remoteCategories, initialValues, category]);

  // Falls back to Personal until the user explicitly picks a different Purpose.
  const selectedPurposeId = purposeId ?? defaultPurposeId;

  function reset() {
    setName("");
    setCategory("Trip");
    setLocation("");
    setBudget("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setMembers([makeYouMember()]);
    setCustomName("");
    setPurposeId(undefined);
  }

  function isSelectedFriend(friendId: string) {
    return members.some((m) => m.friendId === friendId);
  }

  function toggleFriend(friend: Friend) {
    setMembers((current) => {
      if (current.some((m) => m.friendId === friend.id)) {
        return current.filter((m) => m.friendId !== friend.id);
      }
      if (
        current.some(
          (m) => m.name.toLowerCase() === friend.name.toLowerCase(),
        )
      ) {
        return current;
      }
      return [...current, memberFromFriend(friend)];
    });
  }

  function removeMember(memberId: string) {
    setMembers((current) =>
      current.filter((m) => m.id !== memberId || m.isCurrentUser),
    );
  }

  function addCustomMember() {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === "you") return;
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      setCustomName("");
      return;
    }
    setMembers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        isCurrentUser: false,
      },
    ]);
    setCustomName("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    // Ensure "You" is always first with isCurrentUser.
    const roster: TripMember[] = isEditing
      ? initialValues!.members
      : (() => {
          const you =
            members.find((m) => m.isCurrentUser) ?? makeYouMember();
          const others = members.filter((m) => !m.isCurrentUser);
          return [
            { ...you, name: "You", isCurrentUser: true },
            ...others.map((m) => ({ ...m, isCurrentUser: false })),
          ];
        })();

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        location: location.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        startDate,
        endDate: endDate || undefined,
        status: initialValues?.status ?? "active",
        isActive: initialValues?.isActive ?? true,
        purposeId: selectedPurposeId,
        members: roster,
        // Linking is driven by mobile SMS auto-detect settings, not this form.
        // Keep true so active trips in date range can receive linked spends.
        autoAddMode: true,
      });
      if (!isEditing) reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit outing" : "Create outing"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this outing's details."
              : "Start a trip or event and split expenses with friends."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="outing-name">Outing name</Label>
            <Input
              id="outing-name"
              placeholder='e.g., "Kerala Trip 2026"'
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <p className="text-xs text-muted-foreground">
              Pick a type, use Other, or add your own (saved for next time).
            </p>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((item) => (
                <button
                  key={item}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    category === item
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  type="button"
                  onClick={() => {
                    setCategory(item);
                    setShowNewCategory(false);
                  }}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition-colors",
                  showNewCategory
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setShowNewCategory((v) => !v)}
              >
                <Plus className="size-3" />
                Add category
              </button>
            </div>
            {showNewCategory ? (
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="e.g. Camping, Concert"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void (async () => {
                        const n = customCategory.trim();
                        if (!n) return;
                        try {
                          await addCategory(n);
                        } catch {
                          /* offline / RLS — still select locally */
                        }
                        setCategory(n);
                        setCustomCategory("");
                        setShowNewCategory(false);
                      })();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!customCategory.trim()}
                  onClick={() => {
                    void (async () => {
                      const n = customCategory.trim();
                      if (!n) return;
                      try {
                        await addCategory(n);
                      } catch {
                        /* still allow local select */
                      }
                      setCategory(n);
                      setCustomCategory("");
                      setShowNewCategory(false);
                    })();
                  }}
                >
                  Save
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <p className="text-xs text-muted-foreground">
              Applied to this outing&apos;s spends automatically — no need to pick
              a purpose per transaction while the trip is active.
            </p>
            <div className="flex flex-wrap gap-2">
              {activePurposes.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedPurposeId === item.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  type="button"
                  onClick={() => setPurposeId(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outing-start">Start date</Label>
              <Input
                id="outing-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outing-end">End date</Label>
              <Input
                id="outing-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outing-location">Location</Label>
              <Input
                id="outing-location"
                placeholder="Goa, Chennai..."
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outing-budget">Budget (optional)</Label>
              <Input
                id="outing-budget"
                inputMode="decimal"
                placeholder="50000"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Label>Members</Label>
              <div className="flex flex-wrap gap-2">
                {initialValues!.members.map((member) => (
                  <span
                    key={member.id}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {member.name}
                    {member.isCurrentUser ? " (You)" : ""}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Membership can&apos;t be edited here — existing expenses and
                settlements are tied to these members.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Members</Label>
                <p className="text-xs text-muted-foreground">
                  Name is enough to add someone. UPI can be filled later on
                  Friends.
                </p>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => (
                    <span
                      key={member.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                        member.isCurrentUser
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted/40 text-foreground",
                      )}
                    >
                      {member.name}
                      {member.upiId ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          · {member.upiId}
                        </span>
                      ) : null}
                      {!member.isCurrentUser ? (
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => removeMember(member.id)}
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Add from friends</Label>
                <div className="flex flex-wrap gap-2">
                  {friends.map((friend) => (
                    <button
                      key={friend.id}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        isSelectedFriend(friend.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                      type="button"
                      onClick={() => toggleFriend(friend)}
                    >
                      {friend.name}
                      {friend.upiId ? (
                        <span className="ml-1 opacity-70">· {friend.upiId}</span>
                      ) : null}
                    </button>
                  ))}
                  {friends.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Add friends first, or type a custom name below.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="outing-custom-member">
                  Quick add (name only)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="outing-custom-member"
                    placeholder="Type a name — UPI optional later"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomMember();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustomMember}
                    disabled={!customName.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={submitting || !name.trim()} type="submit">
              {isEditing ? "Save changes" : "Create outing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
