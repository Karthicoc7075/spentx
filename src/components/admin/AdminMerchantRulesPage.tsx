"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPagination,
  StatusPill,
  errorMessage,
  useDebouncedValue,
} from "@/components/admin/admin-ui";
import {
  adminDeleteKeywordRule,
  adminDeleteMerchantBrand,
  adminUpsertKeywordRule,
  adminUpsertMerchantBrand,
  isMissingMigrationError,
  listCategoryCatalog,
  listKeywordRules,
  listMerchantBrands,
  type KeywordRule,
  type MerchantBrand,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;
const MIGRATION = "20261011_merchant_category_rules.sql";
const selectClass = "h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground";

const splitList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Merchant → category rules used by SMS auto-categorisation. Requires the
 * merchant_category_rules migration; until it is applied this page shows a
 * "run migration" state instead of erroring.
 */
export function AdminMerchantRulesPage() {
  const [tab, setTab] = useState<"brands" | "keywords">("brands");
  const catalog = useQuery({ queryKey: ["admin-category-catalog-entries"], queryFn: listCategoryCatalog, staleTime: 5 * 60_000 });

  if (catalog.error && isMissingMigrationError(catalog.error)) {
    return (
      <div className="grid gap-5">
        <AdminPageHeader title="Merchant rules" />
        <AdminErrorState error={catalog.error} migration={MIGRATION} onRetry={() => catalog.refetch()} />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Merchant rules"
        description="Brands and keyword rules that map SMS merchants to categories. Changes are audited and picked up by apps on their next rules sync."
      />
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {(["brands", "keywords"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
              tab === value && "bg-background text-foreground shadow-sm",
            )}
          >
            {value === "brands" ? "Brands" : "Keyword rules"}
          </button>
        ))}
      </div>
      {catalog.error ? <AdminErrorState error={catalog.error} onRetry={() => catalog.refetch()} /> : null}
      {tab === "brands" ? (
        <BrandsTab categories={catalog.data ?? []} />
      ) : (
        <KeywordsTab categories={catalog.data ?? []} />
      )}
    </div>
  );
}

type Categories = Array<{ slug: string; display_name: string }>;

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (value: string) => void; categories: Categories }) {
  return (
    <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select category…</option>
      {categories.map((category) => (
        <option key={category.slug} value={category.slug}>
          {category.display_name} ({category.slug})
        </option>
      ))}
    </select>
  );
}

function BrandsTab({ categories }: { categories: Categories }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<MerchantBrand> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MerchantBrand | null>(null);
  const debounced = useDebouncedValue(search.trim());
  const query = useQuery({
    queryKey: ["admin-merchant-brands", debounced, page],
    queryFn: () => listMerchantBrands({ search: debounced, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    await adminDeleteMerchantBrand(pendingDelete.id);
    notify({ title: "Brand deleted", description: pendingDelete.canonical_name });
    setPendingDelete(null);
    queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
  };

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Search brand or category…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
        </div>
        <Button size="sm" className="h-9" onClick={() => setEditing({ is_active: true, aliases: [], upi_handles: [], sms_patterns: [] })}>
          <Plus className="size-3.5" /> Add brand
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.error ? (
        <AdminErrorState error={query.error} migration={MIGRATION} onRetry={() => query.refetch()} />
      ) : !rows.length ? (
        <AdminEmptyState title="No brands found" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">Brand</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Aliases / UPI</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((brand) => (
                <tr key={brand.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="font-medium">{brand.canonical_name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{brand.normalized_name}</p>
                  </td>
                  <td className="px-3 py-2 font-mono">{brand.category_slug}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground">
                    {[...(brand.aliases ?? []), ...(brand.upi_handles ?? [])].join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={brand.is_active ? "success" : "muted"}>{brand.is_active ? "active" : "off"}</StatusPill>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(brand)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 rounded-lg"
                        aria-label="Delete"
                        onClick={() => setPendingDelete(brand)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination page={page} pageSize={PAGE_SIZE} total={query.data?.total} onPageChange={setPage} loading={query.isFetching} />
      <BrandDialog
        brand={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] })}
      />
      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete "${pendingDelete.canonical_name}"?` : ""}
        description="This removes the brand from merchant rules. SMS matching this merchant will no longer be auto-assigned."
        confirmLabel="Delete brand"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

function BrandDialog({
  brand,
  categories,
  onClose,
  onSaved,
}: {
  brand: Partial<MerchantBrand> | null;
  categories: Categories;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "", aliases: "", upi: "", patterns: "", active: true });
  const [loadedFor, setLoadedFor] = useState<Partial<MerchantBrand> | null>(null);

  // Re-seed the form whenever a different brand is opened (state-from-props).
  if (brand !== loadedFor) {
    setLoadedFor(brand);
    if (brand) {
      setError(null);
      setForm({
        name: brand.canonical_name ?? "",
        category: brand.category_slug ?? "",
        aliases: (brand.aliases ?? []).join(", "),
        upi: (brand.upi_handles ?? []).join(", "),
        patterns: (brand.sms_patterns ?? []).join("\n"),
        active: brand.is_active ?? true,
      });
    }
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminUpsertMerchantBrand({
        id: brand?.id,
        canonical_name: form.name.trim(),
        category_slug: form.category,
        aliases: splitList(form.aliases),
        upi_handles: splitList(form.upi),
        sms_patterns: form.patterns.split("\n").map((line) => line.trim()).filter(Boolean),
        is_active: form.active,
      });
      notify({ title: brand?.id ? "Brand updated" : "Brand added", description: form.name });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(brand)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{brand?.id ? "Edit brand" : "Add brand"}</DialogTitle>
          <DialogDescription>Aliases and UPI handles are comma-separated. SMS patterns: one regex per line.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-xs">
          <label className="grid gap-1">Brand name<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="grid gap-1">Category<CategorySelect value={form.category} onChange={(category) => setForm({ ...form, category })} categories={categories} /></label>
          <label className="grid gap-1">Aliases<Input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} /></label>
          <label className="grid gap-1">UPI handles<Input value={form.upi} onChange={(event) => setForm({ ...form, upi: event.target.value })} /></label>
          <label className="grid gap-1">SMS patterns<Textarea rows={3} className="font-mono text-xs" value={form.patterns} onChange={(event) => setForm({ ...form, patterns: event.target.value })} /></label>
          <label className="flex items-center justify-between">Active<Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /></label>
          {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !form.name.trim() || !form.category}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeywordsTab({ categories }: { categories: Categories }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<KeywordRule> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KeywordRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim());
  const query = useQuery({
    queryKey: ["admin-keyword-rules", debounced, page],
    queryFn: () => listKeywordRules({ search: debounced, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];

  const open = (rule: Partial<KeywordRule>) => {
    setError(null);
    setEditing(rule);
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    await adminDeleteKeywordRule(pendingDelete.id);
    notify({ title: "Rule deleted", description: pendingDelete.keyword });
    setPendingDelete(null);
    queryClient.invalidateQueries({ queryKey: ["admin-keyword-rules"] });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.match_type === "regex" && editing.keyword) new RegExp(editing.keyword);
      await adminUpsertKeywordRule(editing);
      notify({ title: editing.id ? "Rule updated" : "Rule added", description: editing.keyword });
      await queryClient.invalidateQueries({ queryKey: ["admin-keyword-rules"] });
      setEditing(null);
    } catch (err) {
      setError(err instanceof SyntaxError ? `Invalid regex: ${err.message}` : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Search keyword or category…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
        </div>
        <Button size="sm" className="h-9" onClick={() => open({ match_type: "word", applies_to: "merchant", direction: "any", priority: 50, is_active: true })}>
          <Plus className="size-3.5" /> Add rule
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.error ? (
        <AdminErrorState error={query.error} migration={MIGRATION} onRetry={() => query.refetch()} />
      ) : !rows.length ? (
        <AdminEmptyState title="No keyword rules found" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">Keyword</th>
                <th className="px-3 py-2.5 font-semibold">Match</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 text-right font-semibold">Priority</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <tr key={rule.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono">{rule.keyword}</td>
                  <td className="px-3 py-2 text-muted-foreground">{rule.match_type} · {rule.applies_to} · {rule.direction}</td>
                  <td className="px-3 py-2 font-mono">{rule.category_slug}</td>
                  <td className="px-3 py-2 text-right font-mono">{rule.priority}</td>
                  <td className="px-3 py-2"><StatusPill tone={rule.is_active ? "success" : "muted"}>{rule.is_active ? "active" : "off"}</StatusPill></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => open(rule)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 rounded-lg"
                        aria-label="Delete"
                        onClick={() => setPendingDelete(rule)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination page={page} pageSize={PAGE_SIZE} total={query.data?.total} onPageChange={setPage} loading={query.isFetching} />

      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete keyword rule "${pendingDelete.keyword}"?` : ""}
        description="This keyword will no longer map SMS transactions to categories."
        confirmLabel="Delete rule"
        destructive
        onConfirm={handleDelete}
      />

      <Dialog open={Boolean(editing)} onOpenChange={(value) => !value && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit keyword rule" : "Add keyword rule"}</DialogTitle>
            <DialogDescription>Higher priority wins when several rules match.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3 text-xs">
              <label className="grid gap-1">Keyword<Input value={editing.keyword ?? ""} onChange={(event) => setEditing({ ...editing, keyword: event.target.value })} /></label>
              <div className="grid grid-cols-3 gap-2">
                <label className="grid gap-1">Match
                  <select className={selectClass} value={editing.match_type} onChange={(event) => setEditing({ ...editing, match_type: event.target.value as KeywordRule["match_type"] })}>
                    {["word", "prefix", "contains", "regex"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">Applies to
                  <select className={selectClass} value={editing.applies_to} onChange={(event) => setEditing({ ...editing, applies_to: event.target.value as KeywordRule["applies_to"] })}>
                    {["merchant", "sms", "vpa"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">Direction
                  <select className={selectClass} value={editing.direction} onChange={(event) => setEditing({ ...editing, direction: event.target.value as KeywordRule["direction"] })}>
                    {["any", "debit", "credit"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label className="grid gap-1">Category<CategorySelect value={editing.category_slug ?? ""} onChange={(category_slug) => setEditing({ ...editing, category_slug })} categories={categories} /></label>
              <label className="grid gap-1">Priority (0–1000)<Input type="number" value={String(editing.priority ?? 50)} onChange={(event) => setEditing({ ...editing, priority: Number(event.target.value) })} /></label>
              <label className="grid gap-1">Note<Input value={editing.note ?? ""} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></label>
              <label className="flex items-center justify-between">Active<Switch checked={editing.is_active ?? true} onCheckedChange={(is_active) => setEditing({ ...editing, is_active })} /></label>
              {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !editing?.keyword?.trim() || !editing?.category_slug}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
