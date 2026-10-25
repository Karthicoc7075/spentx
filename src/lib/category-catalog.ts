import type { Category, DefaultCategory } from "@/types";

/**
 * Default categories come only from `public.category_catalog` (admin-owned,
 * read by every client). Same rules as the mobile app's CategoryCatalog:
 * active top-level expense / income rows plus the children of `income`,
 * ordered by sort_order then slug, one entry per type + app_category.
 */
export type CatalogRow = {
  slug: string;
  display_name?: string | null;
  parent_slug?: string | null;
  app_category?: string | null;
  txn_type?: string | null;
  icon?: string | null;
  color_hex?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export const CATALOG_COLUMNS =
  "slug, display_name, parent_slug, app_category, txn_type, icon, color_hex, sort_order, is_active";

const DEFAULT_COLOR = "#64748b";

export function catalogDefaults(
  rows: CatalogRow[],
  isKnownIcon: (icon: string) => boolean = () => true,
): DefaultCategory[] {
  const kept = rows.filter((row) => {
    if (!row || typeof row.slug !== "string" || row.is_active === false) return false;
    if (row.txn_type !== "expense" && row.txn_type !== "income") return false;
    if (!row.app_category?.trim()) return false;
    return !row.parent_slug || row.parent_slug === "income";
  });
  kept.sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug),
  );
  const seen = new Set<string>();
  const out: DefaultCategory[] = [];
  for (const row of kept) {
    const name = row.app_category!.trim();
    const type = row.txn_type as "expense" | "income";
    const key = categoryKey(type, name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.slug,
      name,
      type,
      color: row.color_hex || DEFAULT_COLOR,
      icon: row.icon && isKnownIcon(row.icon) ? row.icon : "",
      order: out.length,
      isInvestment: row.slug === "investment",
    });
  }
  return out;
}

export function categoryKey(type: string, name: string) {
  return `${type === "income" ? "income" : "expense"}|${name.trim().toLowerCase()}`;
}

/** Picker shape for a catalog default. */
export function defaultToCategory(item: DefaultCategory): Category {
  return {
    id: `cat-${item.id}`,
    name: item.name,
    type: item.type,
    color: item.color,
    icon: item.icon || undefined,
    isDefault: true,
    canDelete: false,
    isActive: true,
    source: "global",
    isInvestment: item.isInvestment ?? false,
  };
}

/**
 * Used only when the catalog cannot be read (signed out / offline first
 * load). Deliberately tiny — the real list is the catalog.
 */
export const MINIMAL_FALLBACK_CATEGORIES: Category[] = (
  [
    ["food_dining", "Food & Dining", "expense", "#f97316"],
    ["groceries", "Groceries", "expense", "#22c55e"],
    ["transportation", "Transportation", "expense", "#3b82f6"],
    ["shopping", "Shopping", "expense", "#ec4899"],
    ["bills_emi", "Bills & EMI", "expense", "#ef4444"],
    ["investment", "Investment", "expense", "#0ea5e9"],
    ["miscellaneous", "Miscellaneous", "expense", "#64748b"],
    ["salary", "Salary", "income", "#10b981"],
    ["income", "Other Income", "income", "#14b8a6"],
  ] as const
).map(([slug, name, type, color], order) =>
  defaultToCategory({
    id: slug,
    name,
    type,
    color,
    icon: "",
    order,
    isInvestment: slug === "investment",
  }),
);

/**
 * Defaults + the user's own rows. One entry per type + name: the user's row
 * wins (their colour / icon), a default the user deleted (inactive row with
 * the same name) stays hidden, and no user row is ever dropped.
 */
export function mergeDefaultAndCustom(defaults: Category[], custom: Category[]): Category[] {
  const userKeys = new Set(custom.map((c) => categoryKey(c.type, c.name)));
  const out: Category[] = [];
  const seen = new Set<string>();
  for (const cat of defaults) {
    const key = categoryKey(cat.type, cat.name);
    if (userKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(cat);
  }
  const seenIds = new Set<string>();
  for (const cat of custom) {
    if (seenIds.has(cat.id)) continue;
    seenIds.add(cat.id);
    out.push(cat);
  }
  return out;
}
