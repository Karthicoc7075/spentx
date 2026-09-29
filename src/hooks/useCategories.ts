"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomCategories, fetchGlobalSettings, fetchSharedCategories } from "@/lib/supabase-data";
import { defaultCategories } from "@/lib/mock-data";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";
import { useShareSession } from "@/providers/share-provider";
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
 * Merged category list:
 * - Signed-in / owner view: globalSettings.defaultCategories + user's custom categories
 * - Shared viewer: globalSettings.defaultCategories + custom categories on that token's splits
 */
export function useCategories() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const share = useShareSession();
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
    enabled: !share && (isReady || !isConfigured) && Boolean(effectiveUserId),
    placeholderData: (previousData) => {
      if (share) return [];
      if (previousData !== undefined) return previousData;
      return readQueryCache<Category[]>(effectiveUserId, cacheKeys.categories) ?? [];
    },
    staleTime: 60_000,
  });

  const sharedQuery = useQuery<Category[]>({
    queryKey: queryKeys.sharedCategories(share?.token ?? ""),
    queryFn: async (): Promise<Category[]> => {
      if (!share?.token) return [];
      return fetchSharedCategories(share.token);
    },
    enabled: Boolean(share?.token),
    staleTime: 60_000,
  });

  const globalDefaults = globalQuery.data;
  const customData = customQuery.data;
  const sharedData = sharedQuery.data;

  const categories = useMemo(() => {
    const defaults = globalDefaults ?? FALLBACK_GLOBAL;
    const byKey = new Map<string, Category>();
    for (const cat of defaults) byKey.set(cat.id, cat);

    if (share) {
      for (const cat of sharedData ?? []) {
        byKey.set(cat.id, { ...cat, source: "custom" });
      }
      return [...byKey.values()];
    }

    const custom = customData ?? [];
    for (const cat of custom) byKey.set(cat.id, cat);
    return [...byKey.values()];
  }, [share, globalDefaults, customData, sharedData]);

  return {
    categories,
    isLoading: share
      ? (globalQuery.isPending && globalQuery.data === undefined) ||
        (sharedQuery.isPending && sharedQuery.data === undefined)
      : (globalQuery.isPending && globalQuery.data === undefined) ||
        (customQuery.isPending && customQuery.data === undefined),
    isRefreshing: share
      ? globalQuery.isFetching || sharedQuery.isFetching
      : globalQuery.isFetching || customQuery.isFetching,
    error: share
      ? globalQuery.error ?? sharedQuery.error
      : globalQuery.error ?? customQuery.error,
  };
}