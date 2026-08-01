"use client";

import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
import { CategoryFilterDropdown } from "@/components/shared/CategoryFilterDropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useContributors } from "@/hooks/useContributors";
import { usePurposes } from "@/hooks/usePurposes";
import {
  useSmartViews,
  type SmartViewDraft,
} from "@/hooks/useSmartViews";
import { describeSmartView, isSmartViewActive, resolveSmartViewFilters } from "@/lib/smart-views";
import { getActivePurposes } from "@/lib/purposes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { AnalyticsFilters, SmartView } from "@/types";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const MAX_SMART_VIEWS = 10;

const emptyDraft: SmartViewDraft = {
  name: "",
  accountId: null,
  purposeId: null,
  categoryIds: [],
  contributorId: null,
};

type SmartViewsPanelProps = {
  filters: AnalyticsFilters;
  onApplyPartial: (partial: Partial<AnalyticsFilters>) => void;
};

export function SmartViewsPanel({ filters, onApplyPartial }: SmartViewsPanelProps) {
  const { notify } = useToast();
  const { accounts } = useAccounts();
  const { purposes } = usePurposes();
  const activePurposes = getActivePurposes(purposes);
  const { categories } = useCategories();
  const { contributors } = useContributors();
  const { smartViews, addSmartView, updateSmartView, removeSmartView } =
    useSmartViews();

  const context = { accounts, purposes, categories, contributors };
  const showContributorField = contributors.length > 1;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SmartViewDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  function openCreateDialog() {
    setEditingId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  }

  function openEditDialog(view: SmartView) {
    setEditingId(view.id);
    setDraft({
      name: view.name,
      accountId: view.accountId,
      purposeId: view.purposeId,
      categoryIds: view.categoryIds,
      contributorId: view.contributorId,
    });
    setDialogOpen(true);
  }

  function applyView(view: SmartView) {
    onApplyPartial(resolveSmartViewFilters(view, context));
  }

  function clearActiveView() {
    onApplyPartial({
      account: "",
      purposeId: "",
      purpose: "",
      categories: [],
      contributorSource: "",
    });
  }

  function toggleView(view: SmartView) {
    if (isSmartViewActive(view, filters, context)) {
      clearActiveView();
    } else {
      applyView(view);
    }
  }

  async function handleSave() {
    const trimmed = draft.name.trim();
    if (!trimmed) return;

    if (!editingId && smartViews.length >= MAX_SMART_VIEWS) {
      notify({
        title: "Smart View limit reached",
        description: `You can save up to ${MAX_SMART_VIEWS} Smart Views. Delete one to add another.`,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload: SmartViewDraft = {
        ...draft,
        name: trimmed,
        // A stale selection from before contributors dropped to 1 shouldn't
        // persist once the field is no longer shown.
        contributorId: showContributorField ? draft.contributorId : null,
      };
      const saved = editingId
        ? await updateSmartView(editingId, payload)
        : await addSmartView(payload);
      notify({ title: editingId ? "Smart View updated" : "Smart View saved" });
      setDialogOpen(false);
      applyView(saved);
    } catch (error) {
      notify({
        title: "Could not save Smart View",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(view: SmartView) {
    try {
      await removeSmartView(view.id);
      if (isSmartViewActive(view, filters, context)) {
        clearActiveView();
      }
      notify({ title: "Smart View deleted" });
    } catch (error) {
      notify({
        title: "Could not delete Smart View",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {smartViews.map((view) => {
          const active = isSmartViewActive(view, filters, context);
          return (
            <div
              key={view.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-xl border px-3 py-1.5 transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-card/80 hover:border-border hover:bg-muted",
              )}
              title={describeSmartView(view, context)}
            >
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => toggleView(view)}
              >
                <p
                  className={cn(
                    "truncate text-xs font-semibold",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  {view.name}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {describeSmartView(view, context)}
                </p>
              </button>
              <button
                type="button"
                aria-label={`Edit ${view.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  openEditDialog(view);
                }}
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${view.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete(view);
                }}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}

        <Button type="button" variant="outline" onClick={openCreateDialog}>
          <Plus className="mr-2 size-4" />
          New Smart View
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {editingId ? "Edit Smart View" : "New Smart View"}
            </DialogTitle>
            <DialogDescription>
              A saved filter combination you can reapply any month — it never
              stores a date range, just Account / Purpose / Category
              {showContributorField ? " / Contributor" : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="smart-view-name">Name</Label>
              <Input
                id="smart-view-name"
                placeholder="e.g. Groceries · Account 1"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="smart-view-account">Account</Label>
              <select
                id="smart-view-account"
                className={selectClassName}
                value={draft.accountId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    accountId: event.target.value || null,
                  }))
                }
              >
                <option value="">All Accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="smart-view-purpose">Purpose</Label>
              <select
                id="smart-view-purpose"
                className={selectClassName}
                value={draft.purposeId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    purposeId: event.target.value || null,
                  }))
                }
              >
                <option value="">All Purposes</option>
                {activePurposes.map((purpose) => (
                  <option key={purpose.id} value={purpose.id}>
                    {purpose.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label>Category</Label>
              <CategoryFilterDropdown
                categories={categories}
                selected={draft.categoryIds
                  .map((id) => categories.find((item) => item.id === id)?.name)
                  .filter((name): name is string => Boolean(name))}
                onChange={(names) =>
                  setDraft((current) => ({
                    ...current,
                    categoryIds: names
                      .map((name) => categories.find((item) => item.name === name)?.id)
                      .filter((id): id is string => Boolean(id)),
                  }))
                }
              />
            </div>

            {showContributorField ? (
              <div className="grid gap-1.5">
                <Label htmlFor="smart-view-contributor">Contributor</Label>
                <select
                  id="smart-view-contributor"
                  className={selectClassName}
                  value={draft.contributorId ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contributorId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">Any contributor</option>
                  {contributors.map((contributor) => (
                    <option key={contributor.id} value={contributor.id}>
                      {contributor.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!draft.name.trim() || isSaving} onClick={handleSave}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
