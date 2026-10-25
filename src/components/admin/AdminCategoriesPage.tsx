"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminConfirmDialog, AdminErrorState, AdminPageHeader } from "@/components/admin/admin-ui";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSetCatalogCategoryActive, adminUpsertCatalogCategory } from "@/lib/admin-api";
import { fetchCatalogDefaults } from "@/lib/supabase-data";
import { getCategoryIcon } from "@/lib/transaction-ui";
import { InlineIconPicker, InlineColorPicker, saveCustomPaletteColor } from "@/components/shared/IconPicker";
import { queryKeys } from "@/lib/query-keys";
import type { DefaultCategory } from "@/types";
import { useToast } from "@/providers/toast-provider";

type FormState = {
  mode: "add" | "edit";
  type: "income" | "expense";
  id: string;
  name: string;
  color: string;
  icon: string;
};

/** category_catalog slug: ^[a-z0-9_]+$ */
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Dedicated CRUD for the shared default category list. These categories
// appear in EVERY user's picker — changes here are global, and the confirm
// copy says so. The list is public.category_catalog (the only source of
// default categories for web + app); writes go through audited admin RPCs.
// Catalog changes bump rules_version, so apps re-sync them; web sessions
// refetch queryKeys.categoryCatalog. "Remove" deactivates, never deletes.
export function AdminCategoriesPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DefaultCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: categories = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-category-catalog"],
    queryFn: fetchCatalogDefaults,
  });

  const income = categories
    .filter((category) => category.type === "income")
    .sort((a, b) => a.order - b.order);
  const expense = categories
    .filter((category) => category.type === "expense")
    .sort((a, b) => a.order - b.order);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-category-catalog"] });
    // Same cache key every user session reads for pickers.
    queryClient.invalidateQueries({ queryKey: queryKeys.categoryCatalog() });
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      notify({ title: "Name required", description: "Give the category a name." });
      return;
    }
    setIsSaving(true);
    try {
      if (form.mode === "add") {
        const slug = form.id || slugify(form.name);
        if (!slug) {
          notify({ title: "Name required", description: "Use letters or numbers in the name." });
          return;
        }
        if (categories.some((category) => category.id === slug)) {
          notify({ title: "Already exists", description: `"${slug}" is already a default — edit it instead.` });
          return;
        }
        await adminUpsertCatalogCategory({
          slug,
          name: form.name.trim(),
          type: form.type,
          color: form.color,
          icon: form.icon,
        });
        notify({
          title: "Category added",
          description: `"${form.name.trim()}" is now in every user's ${form.type} picker.`,
        });
      } else {
        await adminUpsertCatalogCategory({
          slug: form.id,
          name: form.name.trim(),
          type: form.type,
          color: form.color,
          icon: form.icon,
        });
        notify({ title: "Category updated", description: `Saved "${form.name.trim()}".` });
      }
      saveCustomPaletteColor(form.color);
      setForm(null);
      refresh();
    } catch (error) {
      notify({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save category.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsSaving(true);
    try {
      await adminSetCatalogCategoryActive(pendingDelete.id, false);
      notify({
        title: "Category removed",
        description: `"${pendingDelete.name}" removed from future pickers. Historical transactions keep their label.`,
      });
      setPendingDelete(null);
      refresh();
    } catch (error) {
      notify({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete category.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSection = (title: string, type: "income" | "expense", list: DefaultCategory[]) => (
    <div className="rounded-2xl border border-border/80 bg-card/40 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <Button
          className="h-8 text-xs font-bold rounded-xl"
          size="sm"
          variant="outline"
          onClick={() =>
            setForm({ mode: "add", type, id: "", name: "", color: "#10b981", icon: "" })
          }
        >
          <Plus className="mr-1 size-3.5" /> Add Category
        </Button>
      </div>
      {list.length ? (
        <div className="grid gap-2">
          {list.map((category) => {
            const Icon = getCategoryIcon(category.icon || category.name);
            return (
              <div
                key={category.id}
                className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:bg-muted/40"
              >
                <span
                  className="flex size-9 items-center justify-center rounded-xl font-bold shadow-xs"
                  style={{ backgroundColor: `${category.color}20`, color: category.color }}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  className="size-3 shrink-0 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: category.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{category.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{category.id}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Edit ${category.name}`}
                    size="icon-sm"
                    variant="ghost"
                    className="rounded-lg"
                    onClick={() =>
                      setForm({
                        mode: "edit",
                        type,
                        id: category.id,
                        name: category.name,
                        color: category.color,
                        icon: category.icon ?? "",
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    aria-label={`Delete ${category.name}`}
                    className="text-rose-500 hover:text-rose-600 rounded-lg"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(category)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No {type} categories configured.</p>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return <AdminErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="grid gap-4">
      <AdminPageHeader
        title="Default categories"
        description="Shared defaults every user sees in their pickers. Removing one keeps the label on existing transactions."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {renderSection("Expense categories", "expense", expense)}
        {renderSection("Income categories", "income", income)}
      </div>

      {/* Add / edit form — shared Dialog (Esc, focus trap, a11y) */}
      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && !isSaving && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          {form ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {form.mode === "add"
                  ? `Add ${form.type === "income" ? "income" : "expense"} category`
                  : "Edit category"}
              </DialogTitle>
              <DialogDescription>Applies to every user&apos;s category picker.</DialogDescription>
            </DialogHeader>

            {/* Hero Input Section */}
            <div className="flex items-center gap-3">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors"
                style={{ backgroundColor: `${form.color}20`, color: form.color }}
              >
                {(() => {
                  const CatIcon = getCategoryIcon(form.icon || form.name);
                  return <CatIcon className="size-6" />;
                })()}
              </div>

              <div className="flex-1 space-y-1">
                <Input
                  autoFocus
                  className="h-10 text-sm font-semibold rounded-xl bg-muted/20 border-border/70"
                  placeholder="Category name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                            id:
                              current.mode === "add"
                                ? slugify(event.target.value)
                                : current.id,
                          }
                        : current,
                    )
                  }
                />
                {form.mode === "add" && form.id ? (
                  <p className="text-[10px] text-muted-foreground font-mono">id: {form.id}</p>
                ) : null}
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Color
              </span>
              <InlineColorPicker
                value={form.color}
                onChange={(hex) =>
                  setForm((current) => (current ? { ...current, color: hex } : current))
                }
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Icon
              </span>
              <InlineIconPicker
                value={form.icon}
                onChange={(icon) =>
                  setForm((current) => (current ? { ...current, icon } : current))
                }
                color={form.color}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 pt-2 border-t border-border/60">
              <Button
                className="h-10 flex-1 text-xs font-bold rounded-xl cursor-pointer"
                disabled={isSaving}
                variant="outline"
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl cursor-pointer"
                disabled={isSaving}
                onClick={handleSave}
              >
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save Category"}
              </Button>
            </div>
          </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirm — global blast radius, and the copy says so */}
      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove "${pendingDelete.name}" for ALL users?` : ""}
        description="It disappears from every user's picker. Existing transactions keep their historical label."
        confirmLabel="Remove for everyone"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
