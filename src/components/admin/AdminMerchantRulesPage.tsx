"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
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
  adminDeleteMerchantBrandKey,
  adminTestMerchantMatch,
  adminUpsertKeywordRule,
  adminUpsertMerchantBrand,
  adminUpsertMerchantBrandKey,
  isMissingMigrationError,
  listCategoryCatalog,
  listKeywordRules,
  listMerchantBrandKeys,
  listMerchantBrands,
  type KeywordRule,
  type MatchResult,
  type MerchantBrand,
  type MerchantBrandKey,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const PAGE_SIZE = 50;
const MIGRATION = "20261011_merchant_category_rules.sql";
const selectClass = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground";

const splitList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

type Categories = Array<{ slug: string; display_name: string }>;

export function AdminMerchantRulesPage() {
  const [tab, setTab] = useState<"brands" | "keys" | "keywords">("brands");
  const catalog = useQuery({
    queryKey: ["admin-category-catalog-entries"],
    queryFn: listCategoryCatalog,
    staleTime: 5 * 60_000,
  });

  if (catalog.error && isMissingMigrationError(catalog.error)) {
    return (
      <div className="grid gap-5">
        <AdminPageHeader title="Merchant rules" />
        <AdminErrorState error={catalog.error} migration={MIGRATION} onRetry={() => catalog.refetch()} />
      </div>
    );
  }

  const categories = catalog.data ?? [];

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Merchant rules & SMS categorization"
        description="Full control over 1,630+ brands, 5,910+ matching keys (UPI & aliases), and 830+ keyword heuristic rules. Any change bumps rule version and updates mobile devices on their next sync."
      />

      {/* Interactive Testing Sandbox */}
      <MerchantRulesSandbox categories={categories} />

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTab("brands")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
              tab === "brands" && "bg-background text-foreground shadow-sm",
            )}
          >
            <span>Brands</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">1,630</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("keys")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
              tab === "keys" && "bg-background text-foreground shadow-sm",
            )}
          >
            <KeyRound className="size-3 text-sky-500" />
            <span>Brand Keys & UPI</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">5,910</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("keywords")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
              tab === "keywords" && "bg-background text-foreground shadow-sm",
            )}
          >
            <span>Keyword Rules</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">836</span>
          </button>
        </div>
      </div>

      {catalog.error ? <AdminErrorState error={catalog.error} onRetry={() => catalog.refetch()} /> : null}

      {tab === "brands" && <BrandsTab categories={categories} />}
      {tab === "keys" && <BrandKeysTab categories={categories} />}
      {tab === "keywords" && <KeywordsTab categories={categories} />}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: Categories;
}) {
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

// -----------------------------------------------------------------------------
// Interactive Live Matcher Sandbox
// -----------------------------------------------------------------------------
function MerchantRulesSandbox({ categories }: { categories: Categories }) {
  const [open, setOpen] = useState(false);
  const [testText, setTestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleTexts = [
    "Paid Rs. 350 at SWIGGY BANGALORE via UPI ref 492019284",
    "Sent Rs. 1,450 to Uber India via UPI uber@axisbank",
    "Paid at IOCL PETROL PUMP MUMBAI for Fuel Rs. 2000",
    "Electricity Bill payment of Rs 1,890 to BESCOM SUCCESSFUL",
  ];

  const handleTest = async (override?: string) => {
    const textToRun = (override ?? testText).trim();
    if (!textToRun) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminTestMerchantMatch(textToRun);
      setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const getCategoryName = (slug: string) =>
    categories.find((c) => c.slug === slug)?.display_name ?? slug;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex cursor-pointer items-center justify-between" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">Live Rule Matcher & Sandbox</h3>
            <p className="text-[11px] text-muted-foreground">
              Test how an SMS or merchant string resolves across UPI handles, brand keys, and keyword rules.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          {open ? "Hide" : "Open Matcher"}
          <ChevronDown className={cn("ml-1 size-3.5 transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="mt-3.5 grid gap-3 border-t border-border pt-3.5 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                className="h-9 font-mono text-xs"
                placeholder="Paste SMS text or merchant name here…"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTest()}
              />
              {testText && (
                <button
                  type="button"
                  onClick={() => { setTestText(""); setResult(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              className="h-9 px-4 text-xs font-medium"
              onClick={() => handleTest()}
              disabled={busy || !testText.trim()}
            >
              {busy ? "Testing…" : "Test Match"}
            </Button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Try sample:</span>
            {sampleTexts.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTestText(sample);
                  handleTest(sample);
                }}
                className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted"
              >
                {sample.slice(0, 28)}…
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div
              className={cn(
                "grid gap-2.5 rounded-xl border p-3",
                result.matched ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.matched ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" /> Match Found
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <XCircle className="size-4" /> Uncategorized
                    </span>
                  )}
                  {result.category && (
                    <span className="rounded-md bg-background px-2 py-0.5 font-mono text-[11px] font-medium shadow-sm">
                      {getCategoryName(result.category)} ({result.category})
                    </span>
                  )}
                </div>
                {result.matched && (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    {Math.round((result.confidence ?? 0) * 100)}% Confidence
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-lg bg-background/80 p-2.5 sm:grid-cols-3">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Matched Stage</span>
                  <p className="font-medium text-foreground">
                    {result.stage === "upi_handle" && "1. UPI Handle"}
                    {result.stage === "brand_key" && "2. Brand Name / Alias"}
                    {result.stage === "keyword_rule" && "3. Keyword Rule"}
                    {result.stage === "none" && "None"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Target Brand</span>
                  <p className="font-medium text-foreground">
                    {result.brand ? result.brand.canonical_name : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Triggered Pattern</span>
                  <p className="font-mono text-foreground font-semibold">
                    {result.key ? `${result.key.key} (${result.key.match_mode})` : result.keyword_rule ? `${result.keyword_rule.keyword} (pri: ${result.keyword_rule.priority})` : "—"}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                {result.explanation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// TAB 1: BRANDS MANAGEMENT (1,630 records)
// -----------------------------------------------------------------------------
function BrandsTab({ categories }: { categories: Categories }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<MerchantBrand> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MerchantBrand | null>(null);
  const [brandKeysDrawer, setBrandKeysDrawer] = useState<MerchantBrand | null>(null);

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
    queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-xs"
            placeholder="Search brand, category, or UPI handle…"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          />
        </div>
        <Button
          size="sm"
          className="h-9 text-xs font-medium"
          onClick={() => setEditing({ is_active: true, aliases: [], upi_handles: [], sms_patterns: [], confidence: 0.9 })}
        >
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
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">Brand Identity</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Linked Keys</th>
                <th className="px-3 py-2.5 font-semibold">Sample Aliases / UPI</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((brand) => (
                <tr key={brand.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">{brand.canonical_name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{brand.normalized_name}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] rounded-md bg-muted px-1.5 py-0.5 font-medium">
                      {brand.category_slug}
                    </span>
                    {brand.subcategory && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        / {brand.subcategory}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setBrandKeysDrawer(brand)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 transition-colors hover:bg-sky-500/20 dark:text-sky-400"
                    >
                      <KeyRound className="size-3" />
                      <span>{brand.keys_count ?? 0} keys</span>
                      <ChevronRight className="size-3 opacity-60" />
                    </button>
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground font-mono text-[11px]">
                    {[...(brand.aliases ?? []), ...(brand.upi_handles ?? [])].join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={brand.is_active ? "success" : "muted"}>
                      {brand.is_active ? "active" : "off"}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Manage brand keys"
                        onClick={() => setBrandKeysDrawer(brand)}
                      >
                        <KeyRound className="size-3.5 text-sky-500" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Edit brand"
                        onClick={() => setEditing(brand)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 rounded-lg"
                        title="Delete brand"
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

      <AdminPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={query.data?.total}
        onPageChange={setPage}
        loading={query.isFetching}
      />

      {/* Edit Brand Modal */}
      <BrandDialog
        brand={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
          queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
        }}
      />

      {/* Delete Brand Dialog */}
      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete "${pendingDelete.canonical_name}"?` : ""}
        description={`This removes "${pendingDelete?.canonical_name}" and cascades to delete all linked UPI handles and alias keys from merchant_brand_keys. SMS matching this merchant will no longer be auto-assigned.`}
        confirmLabel="Delete brand and keys"
        destructive
        onConfirm={handleDelete}
      />

      {/* Brand Keys Drawer Modal */}
      {brandKeysDrawer && (
        <BrandKeysModal
          brand={brandKeysDrawer}
          onClose={() => {
            setBrandKeysDrawer(null);
            queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// TAB 2: BRAND KEYS & UPI MANAGEMENT (5,910 records)
// -----------------------------------------------------------------------------
function BrandKeysTab({ categories }: { categories: Categories }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [keyType, setKeyType] = useState<string>("all");
  const [matchMode, setMatchMode] = useState<string>("all");
  const [page, setPage] = useState(0);

  const [editingKey, setEditingKey] = useState<Partial<MerchantBrandKey> | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<MerchantBrandKey | null>(null);

  const debounced = useDebouncedValue(search.trim());

  const query = useQuery({
    queryKey: ["admin-merchant-brand-keys", debounced, keyType, matchMode, page],
    queryFn: () =>
      listMerchantBrandKeys({
        search: debounced,
        key_type: keyType,
        match_mode: matchMode,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];

  const handleDelete = async () => {
    if (!pendingDeleteKey) return;
    await adminDeleteMerchantBrandKey({
      brand_id: pendingDeleteKey.brand_id,
      key: pendingDeleteKey.key,
      key_type: pendingDeleteKey.key_type,
    });
    notify({ title: "Brand key deleted", description: pendingDeleteKey.key });
    setPendingDeleteKey(null);
    queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
    queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
  };

  return (
    <div className="grid gap-3">
      {/* Search & Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-xs font-mono"
            placeholder="Search key pattern (e.g. swiggy, zomato, uber@axisbank)…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value={keyType}
            onChange={(e) => { setKeyType(e.target.value); setPage(0); }}
          >
            <option value="all">All Key Types</option>
            <option value="upi">UPI Handle (upi)</option>
            <option value="alias">Alias (alias)</option>
            <option value="name">Brand Name (name)</option>
          </select>

          <select
            className={selectClass}
            value={matchMode}
            onChange={(e) => { setMatchMode(e.target.value); setPage(0); }}
          >
            <option value="all">All Match Modes</option>
            <option value="contains">Contains</option>
            <option value="prefix">Prefix</option>
            <option value="exact">Exact</option>
          </select>

          <Button
            size="sm"
            className="h-9 shrink-0 text-xs font-medium"
            onClick={() =>
              setEditingKey({
                key: "",
                key_type: "alias",
                match_mode: "contains",
                brand_id: "",
              })
            }
          >
            <Plus className="size-3.5" /> Add key
          </Button>
        </div>
      </div>

      {/* Keys Table */}
      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.error ? (
        <AdminErrorState error={query.error} migration={MIGRATION} onRetry={() => query.refetch()} />
      ) : !rows.length ? (
        <AdminEmptyState title="No brand keys found" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 font-semibold">Match Key Pattern</th>
                <th className="px-3 py-2.5 font-semibold">Key Type</th>
                <th className="px-3 py-2.5 font-semibold">Match Mode</th>
                <th className="px-3 py-2.5 font-semibold">Mapped Brand</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.brand_id}-${row.key}-${row.key_type}-${idx}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-medium text-foreground">
                    {row.key}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        row.key_type === "upi" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                        row.key_type === "alias" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        row.key_type === "name" && "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                      )}
                    >
                      {row.key_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-mono",
                        row.match_mode === "exact" && "bg-emerald-500/10 text-emerald-600 font-semibold",
                        row.match_mode === "prefix" && "bg-cyan-500/10 text-cyan-600 font-semibold",
                        row.match_mode === "contains" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {row.match_mode}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.merchant_brands?.canonical_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {row.merchant_brands?.category_slug ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Edit key"
                        onClick={() => setEditingKey(row)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 rounded-lg"
                        title="Delete key"
                        onClick={() => setPendingDeleteKey(row)}
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

      <AdminPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={query.data?.total}
        onPageChange={setPage}
        loading={query.isFetching}
      />

      {/* Edit/Add Key Dialog */}
      {editingKey && (
        <KeyDialog
          keyData={editingKey}
          onClose={() => setEditingKey(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
            queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
          }}
        />
      )}

      {/* Delete Key Dialog */}
      <AdminConfirmDialog
        open={Boolean(pendingDeleteKey)}
        onOpenChange={(open) => !open && setPendingDeleteKey(null)}
        title={pendingDeleteKey ? `Delete key "${pendingDeleteKey.key}"?` : ""}
        description={`This will delete match key "${pendingDeleteKey?.key}" (${pendingDeleteKey?.key_type}) from brand "${pendingDeleteKey?.merchant_brands?.canonical_name ?? "parent brand"}".`}
        confirmLabel="Delete key"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// TAB 3: KEYWORD RULES MANAGEMENT (836 records)
// -----------------------------------------------------------------------------
function KeywordsTab({ categories }: { categories: Categories }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [matchTypeFilter, setMatchTypeFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [editing, setEditing] = useState<Partial<KeywordRule> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KeywordRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounced = useDebouncedValue(search.trim());
  const query = useQuery({
    queryKey: [
      "admin-keyword-rules",
      debounced,
      categoryFilter,
      matchTypeFilter,
      directionFilter,
      page,
    ],
    queryFn: () =>
      listKeywordRules({
        search: debounced,
        category_slug: categoryFilter,
        match_type: matchTypeFilter,
        direction: directionFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
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
      if (editing.match_type === "regex" && editing.keyword) {
        new RegExp(editing.keyword);
      }
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-xs"
            placeholder="Search keyword or category…"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.display_name}</option>
            ))}
          </select>

          <select
            className={selectClass}
            value={matchTypeFilter}
            onChange={(e) => { setMatchTypeFilter(e.target.value); setPage(0); }}
          >
            <option value="all">All Match Types</option>
            <option value="word">Word boundary</option>
            <option value="contains">Contains</option>
            <option value="prefix">Prefix</option>
            <option value="regex">Regex</option>
          </select>

          <select
            className={selectClass}
            value={directionFilter}
            onChange={(e) => { setDirectionFilter(e.target.value); setPage(0); }}
          >
            <option value="all">All Directions</option>
            <option value="any">Any</option>
            <option value="debit">Debit only</option>
            <option value="credit">Credit only</option>
          </select>

          <Button
            size="sm"
            className="h-9 shrink-0 text-xs font-medium"
            onClick={() =>
              open({
                match_type: "word",
                applies_to: "merchant",
                direction: "any",
                priority: 50,
                is_active: true,
              })
            }
          >
            <Plus className="size-3.5" /> Add rule
          </Button>
        </div>
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
                <th className="px-3 py-2.5 font-semibold">Match Logic</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 text-right font-semibold">Priority</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <tr key={rule.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-medium">{rule.keyword}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">{rule.match_type}</span> · {rule.applies_to} · {rule.direction}
                  </td>
                  <td className="px-3 py-2 font-mono">{rule.category_slug}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{rule.priority}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={rule.is_active ? "success" : "muted"}>
                      {rule.is_active ? "active" : "off"}
                    </StatusPill>
                  </td>
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

      <AdminPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={query.data?.total}
        onPageChange={setPage}
        loading={query.isFetching}
      />

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
              <label className="grid gap-1">
                Keyword
                <Input
                  className="font-mono text-xs"
                  value={editing.keyword ?? ""}
                  onChange={(event) => setEditing({ ...editing, keyword: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="grid gap-1">
                  Match
                  <select
                    className={selectClass}
                    value={editing.match_type}
                    onChange={(event) =>
                      setEditing({ ...editing, match_type: event.target.value as KeywordRule["match_type"] })
                    }
                  >
                    {["word", "prefix", "contains", "regex"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  Applies to
                  <select
                    className={selectClass}
                    value={editing.applies_to}
                    onChange={(event) =>
                      setEditing({ ...editing, applies_to: event.target.value as KeywordRule["applies_to"] })
                    }
                  >
                    {["merchant", "sms", "vpa"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  Direction
                  <select
                    className={selectClass}
                    value={editing.direction}
                    onChange={(event) =>
                      setEditing({ ...editing, direction: event.target.value as KeywordRule["direction"] })
                    }
                  >
                    {["any", "debit", "credit"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1">
                Category
                <CategorySelect
                  value={editing.category_slug ?? ""}
                  onChange={(category_slug) => setEditing({ ...editing, category_slug })}
                  categories={categories}
                />
              </label>
              <label className="grid gap-1">
                Priority (0–1000)
                <Input
                  type="number"
                  value={String(editing.priority ?? 50)}
                  onChange={(event) => setEditing({ ...editing, priority: Number(event.target.value) })}
                />
              </label>
              <label className="grid gap-1">
                Note
                <Input
                  value={editing.note ?? ""}
                  onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                />
              </label>
              <label className="flex items-center justify-between">
                Active
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(is_active) => setEditing({ ...editing, is_active })}
                />
              </label>
              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !editing?.keyword?.trim() || !editing?.category_slug}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MODALS: Brand Keys Manager Drawer / Modal
// -----------------------------------------------------------------------------
function BrandKeysModal({ brand, onClose }: { brand: MerchantBrand; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [newKey, setNewKey] = useState("");
  const [keyType, setKeyType] = useState<"alias" | "name" | "upi">("alias");
  const [matchMode, setMatchMode] = useState<"contains" | "prefix" | "exact">("contains");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-brand-keys-drawer", brand.id],
    queryFn: () => listMerchantBrandKeys({ brand_id: brand.id, limit: 100 }),
  });

  const keys = query.data?.rows ?? [];

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminUpsertMerchantBrandKey({
        brand_id: brand.id,
        key: newKey.trim(),
        key_type: keyType,
        match_mode: matchMode,
      });
      notify({ title: "Key added", description: newKey.trim() });
      setNewKey("");
      query.refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteKey = async (key: MerchantBrandKey) => {
    try {
      await adminDeleteMerchantBrandKey({
        brand_id: brand.id,
        key: key.key,
        key_type: key.key_type,
      });
      notify({ title: "Key removed", description: key.key });
      query.refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-brands"] });
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-brand-keys"] });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-sky-500" />
            Keys for &ldquo;{brand.canonical_name}&rdquo;
          </DialogTitle>
          <DialogDescription>
            {keys.length} match keys attached to this brand ({brand.category_slug}). Used for SMS & UPI matching.
          </DialogDescription>
        </DialogHeader>

        {/* Add new key inline bar */}
        <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
          <span className="font-semibold text-foreground">Add New Match Key or UPI Handle</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              className="h-8 flex-1 font-mono text-xs"
              placeholder="e.g. swiggy@axisbank, SWIGGY DINEOUT…"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddKey()}
            />
            <select
              className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
              value={keyType}
              onChange={(e) => {
                const t = e.target.value as "alias" | "name" | "upi";
                setKeyType(t);
                if (t === "upi") setMatchMode("prefix");
                else if (matchMode === "prefix") setMatchMode("contains");
              }}
            >
              <option value="alias">Alias</option>
              <option value="upi">UPI Handle</option>
              <option value="name">Brand Name</option>
            </select>
            <select
              className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
              value={matchMode}
              onChange={(e) => setMatchMode(e.target.value as "contains" | "prefix" | "exact")}
            >
              <option value="contains">Contains</option>
              <option value="prefix">Prefix</option>
              <option value="exact">Exact</option>
            </select>
            <Button
              size="sm"
              className="h-8 text-xs font-medium"
              disabled={busy || !newKey.trim()}
              onClick={handleAddKey}
            >
              Add
            </Button>
          </div>
          {error && <p className="text-destructive text-[11px]">{error}</p>}
        </div>

        {/* Existing keys list */}
        <div className="flex-1 overflow-y-auto pr-1">
          {query.isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : !keys.length ? (
            <p className="text-center py-6 text-xs text-muted-foreground italic">
              No keys attached yet. Add one above!
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-xl border border-border">
              {keys.map((k) => (
                <div
                  key={`${k.key}-${k.key_type}`}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/30 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-foreground">{k.key}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        k.key_type === "upi" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                        k.key_type === "alias" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        k.key_type === "name" && "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                      )}
                    >
                      {k.key_type}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">
                      {k.match_mode}
                    </span>
                  </div>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-rose-500 hover:text-rose-600 size-7"
                    title="Remove key"
                    onClick={() => handleDeleteKey(k)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// MODALS: Brand Add / Edit Dialog
// -----------------------------------------------------------------------------
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
  const [form, setForm] = useState({
    name: "",
    category: "",
    subcategory: "",
    aliases: "",
    upi: "",
    patterns: "",
    active: true,
  });
  const [loadedFor, setLoadedFor] = useState<Partial<MerchantBrand> | null>(null);

  if (brand !== loadedFor) {
    setLoadedFor(brand);
    if (brand) {
      setError(null);
      setForm({
        name: brand.canonical_name ?? "",
        category: brand.category_slug ?? "",
        subcategory: brand.subcategory ?? "",
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
          <DialogDescription>
            Aliases and UPI handles will be synchronized to brand keys. SMS patterns: one regex per line.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-xs">
          <label className="grid gap-1">
            Brand name
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="grid gap-1">
            Category
            <CategorySelect
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              categories={categories}
            />
          </label>
          <label className="grid gap-1">
            Aliases (comma-separated)
            <Input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} />
          </label>
          <label className="grid gap-1">
            UPI handles (comma-separated)
            <Input value={form.upi} onChange={(event) => setForm({ ...form, upi: event.target.value })} />
          </label>
          <label className="grid gap-1">
            SMS patterns
            <Textarea
              rows={3}
              className="font-mono text-xs"
              value={form.patterns}
              onChange={(event) => setForm({ ...form, patterns: event.target.value })}
            />
          </label>
          <label className="flex items-center justify-between">
            Active
            <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
          </label>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form.name.trim() || !form.category}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// MODALS: Key Dialog (Create or Edit Key directly)
// -----------------------------------------------------------------------------
function KeyDialog({
  keyData,
  onClose,
  onSaved,
}: {
  keyData: Partial<MerchantBrandKey>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandSearch, setBrandSearch] = useState(
    keyData.merchant_brands?.canonical_name ?? "",
  );
  const [selectedBrand, setSelectedBrand] = useState<{ id: string; name: string } | null>(
    keyData.brand_id
      ? { id: keyData.brand_id, name: keyData.merchant_brands?.canonical_name ?? keyData.brand_id }
      : null,
  );

  const [key, setKey] = useState(keyData.key ?? "");
  const [keyType, setKeyType] = useState<"alias" | "name" | "upi">(keyData.key_type ?? "alias");
  const [matchMode, setMatchMode] = useState<"contains" | "prefix" | "exact">(
    keyData.match_mode ?? "contains",
  );

  const brandQuery = useQuery({
    queryKey: ["brand-picker-search", brandSearch],
    queryFn: () => listMerchantBrands({ search: brandSearch.trim(), limit: 10 }),
    enabled: Boolean(brandSearch.trim().length > 1),
  });

  const save = async () => {
    if (!selectedBrand?.id || !key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminUpsertMerchantBrandKey({
        brand_id: selectedBrand.id,
        key: key.trim(),
        key_type: keyType,
        match_mode: matchMode,
        old_key: keyData.key,
        old_key_type: keyData.key_type,
      });
      notify({
        title: keyData.key ? "Brand key updated" : "Brand key added",
        description: key.trim(),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{keyData.key ? "Edit brand key" : "Add brand key"}</DialogTitle>
          <DialogDescription>
            Directly configure match pattern, mode, and target brand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-xs">
          {/* Brand picker */}
          <div className="grid gap-1">
            <span className="font-semibold text-foreground">Target Brand</span>
            {selectedBrand ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                <span className="font-medium text-foreground">{selectedBrand.name}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-6 text-muted-foreground"
                  onClick={() => setSelectedBrand(null)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  className="h-8 text-xs"
                  placeholder="Type brand name to search…"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                />
                {brandQuery.data?.rows?.length ? (
                  <div className="absolute left-0 right-0 top-9 z-50 max-h-40 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
                    {brandQuery.data.rows.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBrand({ id: b.id, name: b.canonical_name });
                          setBrandSearch("");
                        }}
                        className="w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-muted font-medium flex items-center justify-between"
                      >
                        <span>{b.canonical_name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{b.category_slug}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className="grid gap-1">
            Match Key Pattern
            <Input
              className="font-mono text-xs"
              placeholder="e.g. swiggyupi, EKART, BUNDL"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              Key Type
              <select
                className={selectClass}
                value={keyType}
                onChange={(e) => {
                  const t = e.target.value as "alias" | "name" | "upi";
                  setKeyType(t);
                  if (t === "upi") setMatchMode("prefix");
                  else if (matchMode === "prefix") setMatchMode("contains");
                }}
              >
                <option value="alias">Alias (alias)</option>
                <option value="upi">UPI Handle (upi)</option>
                <option value="name">Brand Name (name)</option>
              </select>
            </label>

            <label className="grid gap-1">
              Match Mode
              <select
                className={selectClass}
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as "contains" | "prefix" | "exact")}
              >
                <option value="contains">Contains</option>
                <option value="prefix">Prefix</option>
                <option value="exact">Exact</option>
              </select>
            </label>
          </div>

          {error && <p className="rounded-lg bg-destructive/10 p-2 text-destructive text-[11px]">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !key.trim() || !selectedBrand?.id}>
            Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
