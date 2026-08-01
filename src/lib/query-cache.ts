import type { QueryClient } from "@tanstack/react-query";
import { getCurrentPlanMonth } from "@/lib/plan";
import { queryKeys } from "@/lib/query-keys";

const CACHE_PREFIX = "spentx-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  data: unknown;
  savedAt: number;
};

function storageKey(userId: string, key: string) {
  return `${CACHE_PREFIX}:${userId}:${key}`;
}

function readCacheEntry(
  userId: string | undefined,
  key: string,
): CacheEntry | undefined {
  if (!userId || typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(storageKey(userId, key));
    if (!raw) return undefined;

    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(storageKey(userId, key));
      return undefined;
    }

    return entry;
  } catch {
    return undefined;
  }
}

export function readQueryCache<T>(userId: string | undefined, key: string): T | undefined {
  return readCacheEntry(userId, key)?.data as T | undefined;
}

export function readQueryCacheSavedAt(
  userId: string | undefined,
  key: string,
): number | undefined {
  return readCacheEntry(userId, key)?.savedAt;
}

export function writeQueryCache(
  userId: string | undefined,
  key: string,
  data: unknown,
) {
  if (!userId || typeof window === "undefined") return;

  try {
    const entry: CacheEntry = { data, savedAt: Date.now() };
    window.localStorage.setItem(storageKey(userId, key), JSON.stringify(entry));
  } catch {
    // Ignore quota errors.
  }
}

export function removeQueryCache(userId: string | undefined, key: string) {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(storageKey(userId, key));
  } catch {
    // Ignore storage errors.
  }
}

export const cacheKeys = {
  transactions: "transactions",
  accounts: "accounts",
  categories: "categories",
  purposes: "purposes",
  friends: "friends",
  monthlyPlan: (month: string, purposeId = "personal") =>
    `monthlyPlan:${month}:${purposeId}`,
  planTemplates: "planTemplates",
  incomeStreams: "incomeStreams",
  incomeTargets: "incomeTargets",
  savingsGoals: "savingsGoals",
  projectorSettings: "projectorSettings",
  reflections: "reflections",
} as const;

export function hydrateQueryCaches(queryClient: QueryClient, userId: string) {
  const currentMonth = getCurrentPlanMonth();

  const entries: Array<{ queryKey: readonly unknown[]; cacheKey: string }> = [
    { queryKey: queryKeys.accounts(userId), cacheKey: cacheKeys.accounts },
    { queryKey: queryKeys.categories(userId), cacheKey: cacheKeys.categories },
    { queryKey: queryKeys.purposes(userId), cacheKey: cacheKeys.purposes },
    { queryKey: queryKeys.friends(userId), cacheKey: cacheKeys.friends },
    {
      queryKey: queryKeys.incomeStreams(userId),
      cacheKey: cacheKeys.incomeStreams,
    },
    {
      queryKey: queryKeys.incomeTargets(userId),
      cacheKey: cacheKeys.incomeTargets,
    },
    {
      queryKey: queryKeys.savingsGoals(userId),
      cacheKey: cacheKeys.savingsGoals,
    },
    {
      queryKey: queryKeys.projectorSettings(userId),
      cacheKey: cacheKeys.projectorSettings,
    },
    {
      queryKey: queryKeys.reflections(userId),
      cacheKey: cacheKeys.reflections,
    },
    {
      queryKey: queryKeys.monthlyPlan(userId, currentMonth, "personal"),
      cacheKey: cacheKeys.monthlyPlan(currentMonth, "personal"),
    },
    {
      queryKey: queryKeys.planTemplates(userId),
      cacheKey: cacheKeys.planTemplates,
    },
    {
      queryKey: queryKeys.transactions(userId),
      cacheKey: cacheKeys.transactions,
    },
  ];

  for (const { queryKey, cacheKey } of entries) {
    if (queryClient.getQueryData(queryKey) !== undefined) continue;
    const cached = readQueryCache(userId, cacheKey);
    if (cached === undefined) continue;

    const isEmptyTransactionCache =
      cacheKey === cacheKeys.transactions &&
      Array.isArray(cached) &&
      cached.length === 0;

    if (isEmptyTransactionCache) {
      removeQueryCache(userId, cacheKey);
      continue;
    }

    queryClient.setQueryData(queryKey, cached);
  }
}