"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
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
import { cn } from "@/lib/utils";

type FormState = {
  mode: "add" | "edit";
  type: "income" | "expense";
  id: string;
  name: string;
  color: string;
  icon: string;
  customSlug?: boolean;
};

/** category_catalog slug: ^[a-z0-9_]+$ */
function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatSafeDate(iso?: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd MMM yyyy, h:mm a");
  } catch {
    return null;
  }
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
  const [search, setSearch] = useState("");

  const { data: categories = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-category-catalog-defaults"],
    queryFn: fetchCatalogDefaults,
  });

  const income = categories
    .filter((category) => category.type === "income")
    .sort((a, b) => a.order - b.order);
  const expense = categories
    .filter((category) => category.type === "expense")
    .sort((a, b) => a.order - b.order);

  const filteredIncome = income.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredExpense = expense.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()),
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-category-catalog-defaults"] });
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
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: linkedBrands } = await supabase
        .from("merchant_brands")
        .select("id, canonical_name")
        .eq("category_slug", pendingDelete.id);

      if (linkedBrands && linkedBrands.length > 0) {
        const brandNames = linkedBrands.slice(0, 3).map((b: { canonical_name: string }) => b.canonical_name).join(", ");
        notify({
          title: "Cannot deactivate category",
          description: `"${pendingDelete.name}" is linked to ${linkedBrands.length} active brand(s) (${brandNames}${linkedBrands.length > 3 ? ", ..." : ""}). Please reassign the brands in Merchant Rules first.`,
        });
        setPendingDelete(null);
        return;
      }

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
            const createdDateStr = formatSafeDate(category.createdAt);
            return (
              <div
                key={category.id}
                className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:bg-muted/40 hover:border-border"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs"
                  style={{ backgroundColor: `${category.color}20`, color: category.color }}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  className="size-2.5 shrink-0 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: category.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground">{category.name}</p>
                    {category.isInvestment ? (
                      <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                        Investment
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono text-muted-foreground/80">{category.id}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80">
                      <Calendar className="size-3 text-muted-foreground/60" />
                      <span>{createdDateStr ? `Added ${createdDateStr}` : "Default catalog"}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
    <div className="grid gap-5">
      <AdminPageHeader
        title="Default categories"
        description="Shared defaults every user sees in their pickers. Removing one keeps the label on existing transactions."
      />

      {/* Overview Stat Badges & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/60 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="flex size-2 rounded-full bg-emerald-500" />
            <span>Total Defaults: <strong className="font-bold text-foreground">{categories.length}</strong></span>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="text-muted-foreground">
            Expense: <span className="font-semibold text-foreground">{expense.length}</span>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="text-muted-foreground">
            Income: <span className="font-semibold text-foreground">{income.length}</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs rounded-xl bg-background"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {renderSection(
          `Expense categories (${filteredExpense.length}${search ? ` of ${expense.length}` : ""})`,
          "expense",
          filteredExpense,
        )}
        {renderSection(
          `Income categories (${filteredIncome.length}${search ? ` of ${income.length}` : ""})`,
          "income",
          filteredIncome,
        )}
      </div>

      {/* Add / edit form — shared Dialog (Esc, focus trap, a11y) */}
      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && !isSaving && setForm(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl p-6">
          {form ? (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div
                    className="flex size-7 items-center justify-center rounded-lg shadow-xs"
                    style={{ backgroundColor: `${form.color}20`, color: form.color }}
                  >
                    <Layers className="size-4" />
                  </div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    {form.mode === "add"
                      ? `Add ${form.type === "income" ? "Income" : "Expense"} Category`
                      : `Edit Category · ${form.name || form.id}`}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Global default category that appears in every user&apos;s picker. Updates sync to mobile automatically.
                </DialogDescription>
              </DialogHeader>

              {/* Dynamic Live Preview Banner Card */}
              <div
                className="flex items-center justify-between gap-3.5 rounded-2xl border p-3.5 transition-all shadow-xs"
                style={{
                  backgroundColor: `${form.color}0d`,
                  borderColor: `${form.color}35`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-2 ring-background transition-colors"
                    style={{ backgroundColor: `${form.color}25`, color: form.color }}
                  >
                    {(() => {
                      const CatIcon = getCategoryIcon(form.icon || form.name);
                      return <CatIcon className="size-6" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {form.name.trim() || "Category Name"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground truncate">
                      slug: {form.id || (form.mode === "add" ? slugify(form.name) || "auto_generated" : form.id)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                      form.type === "expense"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                    )}
                  >
                    {form.type === "expense" ? (
                      <ArrowDownRight className="size-3.5" />
                    ) : (
                      <ArrowUpRight className="size-3.5" />
                    )}
                    {form.type}
                  </span>
                </div>
              </div>

              {/* Type Switcher Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Category Type
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1 border border-border/60">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              type: "expense",
                              color: current.color === "#10b981" ? "#ef4444" : current.color,
                            }
                          : current,
                      )
                    }
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer",
                      form.type === "expense"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ArrowDownRight className="size-4 text-rose-500" />
                    <span>Expense</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              type: "income",
                              color: current.color === "#ef4444" ? "#10b981" : current.color,
                            }
                          : current,
                      )
                    }
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer",
                      form.type === "income"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ArrowUpRight className="size-4 text-emerald-500" />
                    <span>Income</span>
                  </button>
                </div>
              </div>

              {/* Category Name & Slug */}
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Category Name *
                  </label>
                  <Input
                    autoFocus
                    className="h-10 text-sm font-semibold rounded-xl bg-muted/20 border-border/70"
                    placeholder="e.g. Dining Out, Freelance, Subscriptions..."
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => {
                        if (!current) return current;
                        const newName = event.target.value;
                        const newId =
                          current.mode === "add" && !current.customSlug
                            ? slugify(newName)
                            : current.id;
                        return {
                          ...current,
                          name: newName,
                          id: newId,
                        };
                      })
                    }
                  />
                </div>

                {form.mode === "add" ? (
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Unique ID / Slug
                    </label>
                    <Input
                      className="h-9 text-xs font-mono rounded-xl bg-muted/20 border-border/70"
                      placeholder="e.g. dining_out"
                      value={form.id}
                      onChange={(event) => {
                        const cleanSlug = slugify(event.target.value);
                        setForm((current) =>
                          current
                            ? { ...current, id: cleanSlug, customSlug: true }
                            : current,
                        );
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                      Must use lowercase letters, numbers, and underscores (e.g. food_delivery).
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
                      Database Slug (Immutable)
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {form.id}
                    </span>
                  </div>
                )}
              </div>

              {/* Color Swatches */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Accent Color
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
                  Category Icon
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
              <div className="flex gap-2 pt-3 border-t border-border/60">
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
