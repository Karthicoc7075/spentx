import type { QueryClient } from "@tanstack/react-query";
import { defaultPurposes } from "@/lib/mock-data";
import { cacheKeys, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { normalizePurposes } from "@/lib/purposes";
import type { Account, Category, Purpose } from "@/types";

export function mergeCategories(
  defaults: Category[],
  custom: Category[],
): Category[] {
  const seen = new Set<string>();
  const merged: Category[] = [];

  for (const category of [...defaults, ...custom]) {
    const key = category.id || category.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(category);
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveStoredPurposes(stored: Purpose[]) {
  const source = stored.length > 0 ? stored : defaultPurposes;
  return normalizePurposes(source);
}

export function resolveStoredAccounts(stored: Account[]): Account[] {
  return stored.map((account) => ({
    ...account,
    isActive: account.isActive ?? true,
    openingBalance: account.openingBalance ?? 0,
  }));
}

type SettingsCachePayload = {
  accounts?: Account[];
  categories?: Category[];
  purposes?: Purpose[];
};

export function syncSettingsCache(
  queryClient: QueryClient,
  userId: string | undefined,
  data: SettingsCachePayload,
) {
  if (!userId) return;

  if (data.accounts) {
    queryClient.setQueryData(queryKeys.accounts(userId), data.accounts);
    writeQueryCache(userId, cacheKeys.accounts, data.accounts);
  }

  if (data.categories) {
    queryClient.setQueryData(queryKeys.categories(userId), data.categories);
    writeQueryCache(userId, cacheKeys.categories, data.categories);
  }

  if (data.purposes) {
    queryClient.setQueryData(queryKeys.purposes(userId), data.purposes);
    writeQueryCache(userId, cacheKeys.purposes, data.purposes);
  }
}