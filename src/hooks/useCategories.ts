"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/lib/firebase";
import { defaultCategories } from "@/lib/mock-data";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";
import type { Category } from "@/types";

function getCategoryPlaceholder(userId: string | undefined) {
  const cached = readQueryCache<Category[]>(userId, cacheKeys.categories);
  if (cached !== undefined && cached.length > 0) return cached;
  return defaultCategories;
}

export function useCategories() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const query = useQuery({
    queryKey: queryKeys.categories(effectiveUserId),
    queryFn: async () => {
      const data = await fetchCategories(effectiveUserId);
      writeQueryCache(effectiveUserId, cacheKeys.categories, data);
      return data;
    },
    enabled: (isReady || !isConfigured) && Boolean(effectiveUserId),
    placeholderData: (previousData) => {
      if (previousData !== undefined) return previousData;
      return getCategoryPlaceholder(effectiveUserId);
    },
    staleTime: 60_000,
  });

  return {
    categories: query.data ?? defaultCategories,
    isLoading: query.isPending && query.data === undefined,
    isRefreshing: query.isFetching && !query.isPending,
    error: query.error,
  };
}