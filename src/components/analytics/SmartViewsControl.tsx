"use client";

import { Bookmark, BookmarkPlus, ChevronDown, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/providers/toast-provider";
import type { SavedAnalyticsFilterView } from "@/types";

const MAX_SAVED_VIEWS = 10;

type SmartViewsControlProps = {
  savedViews: SavedAnalyticsFilterView[];
  presetViews: SavedAnalyticsFilterView[];
  onApply: (view: SavedAnalyticsFilterView) => void;
  onSave: (name: string) => SavedAnalyticsFilterView | null;
  onDelete: (viewId: string) => void;
};

export function SmartViewsControl({
  savedViews,
  presetViews,
  onApply,
  onSave,
  onDelete,
}: SmartViewsControlProps) {
  const { notify } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [name, setName] = useState("");

  const atLimit = savedViews.length >= MAX_SAVED_VIEWS;

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const saved = onSave(trimmed);
    if (!saved) {
      notify({
        title: "Smart View limit reached",
        description: `You can save up to ${MAX_SAVED_VIEWS} Smart Views. Delete one to add another.`,
        variant: "destructive",
      });
      return;
    }

    notify({ title: "Smart View saved", description: `"${trimmed}" is ready to reuse.` });
    setName("");
    setSaveDialogOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline">
              <Bookmark className="mr-2 size-4" />
              Smart Views
              <ChevronDown className="ml-2 size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          {presetViews.map((view) => (
            <DropdownMenuItem key={view.id} onClick={() => onApply(view)}>
              {view.name}
            </DropdownMenuItem>
          ))}

          {savedViews.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {savedViews.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between gap-2 px-2 py-1"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm hover:underline cursor-pointer"
                    onClick={() => onApply(view)}
                  >
                    {view.name}
                  </button>
                  <button
                    aria-label={`Delete ${view.name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive cursor-pointer"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(view.id);
                      notify({ title: "Smart View deleted" });
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
            <BookmarkPlus className="mr-2 size-4" />
            Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Smart View</DialogTitle>
            <DialogDescription>
              {atLimit
                ? `You've reached the ${MAX_SAVED_VIEWS}-view limit. Delete an existing view to save a new one.`
                : "Save the current filters so you can reapply them later."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="smart-view-name">Name</Label>
            <Input
              id="smart-view-name"
              placeholder="e.g., Wedding Prep"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || atLimit} onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
