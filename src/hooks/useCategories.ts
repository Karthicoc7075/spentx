"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomCategories, fetchGlobalSettings } from "@/lib/supabase-data";
import { defaultCategories } from "@/lib/mock-data";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";
import type { Category, DefaultCategory } from "@/types";

const FALLBACK_GLOBAL: Category[] = defaultCategories.map((c) => ({
  ...c,
  isDefault: true,
  source: "global",
}));

function mapGlobalDefaults(list: DefaultCategory[]): Category[] {
  return [...list]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      isDefault: true,
      canDelete: false,
      isActive: true,
      source: "global" as const,
      isInvestment: c.isInvestment ?? false,
    }));
}

/**
 * FIRESTORE_REBUILD_SPEC Step 7 — merged category list:
 *   globalSettings.defaultCategories (admin-owned, shared)
 *   + this user's own `categories` docs (custom).
 * Each merged entry carries `source: "global" | "custom"` so Settings can hide
 * edit/delete affordances on global ones. Consumers see the same combined
 * shape as before, so no component markup changes.
 */
export function useCategories() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const globalQuery = useQuery<Category[]>({
    queryKey: queryKeys.globalSettings(),
    queryFn: async (): Promise<Category[]> => {
      const settings = await fetchGlobalSettings();
      if (settings?.defaultCategories?.length) {
        return mapGlobalDefaults(settings.defaultCategories);
      }
      return FALLBACK_GLOBAL;
    },
    enabled: isReady || !isConfigured,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const customQuery = useQuery<Category[]>({
    queryKey: queryKeys.categories(effectiveUserId),
    queryFn: async (): Promise<Category[]> => {
      const data = await fetchCustomCategories(effectiveUserId);
      const tagged: Category[] = data.map((c) => ({ ...c, source: "custom" }));
      writeQueryCache(effectiveUserId, cacheKeys.categories, tagged);
      return tagged;
    },
    enabled: (isReady || !isConfigured) && Boolean(effectiveUserId),
    placeholderData: (previousData) => {
      if (previousData !== undefined) return previousData;
      return readQueryCache<Category[]>(effectiveUserId, cacheKeys.categories) ?? [];
    },
    staleTime: 60_000,
  });

  const globalDefaults = globalQuery.data;
  const customData = customQuery.data;

  const categories = useMemo(() => {
    const defaults = globalDefaults ?? FALLBACK_GLOBAL;
    const custom = customData ?? [];
    const byKey = new Map<string, Category>();
    for (const cat of defaults) byKey.set(cat.id, cat);
    for (const cat of custom) byKey.set(cat.id, cat);
    return [...byKey.values()];
  }, [globalDefaults, customData]);

  return {
    categories,
    isLoading:
      (globalQuery.isPending && globalQuery.data === undefined) ||
      (customQuery.isPending && customQuery.data === undefined),
    isRefreshing: globalQuery.isFetching || customQuery.isFetching,
    error: globalQuery.error ?? customQuery.error,
  };
}