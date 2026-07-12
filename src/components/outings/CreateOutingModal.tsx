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
import { Switch } from "@/components/ui/switch";
import { OUTING_CATEGORIES } from "@/types";
import { cn } from "@/lib/utils";
import type { Friend, Outing, TripMember } from "@/types";

type CreateOutingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  onSubmit: (
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) => Promise<unknown>;
};

export function CreateOutingModal({
  open,
  onOpenChange,
  friends,
  onSubmit,
}: CreateOutingModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Trip");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [autoAddMode, setAutoAddMode] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setCategory("Trip");
    setLocation("");
    setBudget("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setAutoAddMode(true);
    setSelectedFriends([]);
  }

  function toggleFriend(friendId: string) {
    setSelectedFriends((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const members: TripMember[] = [
      { id: crypto.randomUUID(), name: "You", isCurrentUser: true },
      ...selectedFriends.map((friendId) => {
        const friend = friends.find((item) => item.id === friendId);
        return {
          id: crypto.randomUUID(),
          name: friend?.name ?? "Friend",
          friendId,
          upiId: friend?.upiId,
        };
      }),
    ];

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        location: location.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        startDate,
        endDate: endDate || undefined,
        status: "active",
        members,
        autoAddMode,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create outing</DialogTitle>
          <DialogDescription>
            Start a trip or event and split expenses with friends.
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
            <div className="flex flex-wrap gap-2">
              {OUTING_CATEGORIES.map((item) => (
                <button
                  key={item}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    category === item
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  type="button"
                  onClick={() => setCategory(item)}
                >
                  {item}
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

          <div className="flex items-center justify-between rounded-xl border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Auto-add mode</p>
              <p className="text-xs text-muted-foreground">
                Link bank-detected expenses to this outing
              </p>
            </div>
            <Switch checked={autoAddMode} onCheckedChange={setAutoAddMode} />
          </div>

          <div className="space-y-2">
            <Label>Add members</Label>
            <div className="flex flex-wrap gap-2">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedFriends.includes(friend.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  type="button"
                  onClick={() => toggleFriend(friend.id)}
                >
                  {friend.name}
                </button>
              ))}
              {friends.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add friends in Settings to invite them here.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={submitting || !name.trim()} type="submit">
              Create outing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}