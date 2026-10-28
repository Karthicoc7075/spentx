"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomCategories, fetchDefaultCategories, fetchSharedCategories } from "@/lib/supabase-data";
import { MINIMAL_FALLBACK_CATEGORIES, mergeDefaultAndCustom } from "@/lib/category-catalog";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";
import { useShareSession } from "@/providers/share-provider";
import type { Category } from "@/types";

/**
 * Merged category list (defaults come only from category_catalog):
 * - Signed-in / owner view: catalog defaults + user's own categories (one per
 *   type + name; the user's row wins; defaults they deleted stay hidden)
 * - Shared viewer: catalog defaults + custom categories on that token's splits
 */
export function useCategories() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const share = useShareSession();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const globalQuery = useQuery<Category[]>({
    queryKey: queryKeys.categoryCatalog(),
    queryFn: fetchDefaultCategories,
    enabled: isReady || !isConfigured,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
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
    const defaults = globalDefaults ?? MINIMAL_FALLBACK_CATEGORIES;
    if (share) {
      return mergeDefaultAndCustom(
        defaults,
        (sharedData ?? []).map((cat) => ({ ...cat, source: "custom" as const })),
      );
    }
    return mergeDefaultAndCustom(defaults, customData ?? []);
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