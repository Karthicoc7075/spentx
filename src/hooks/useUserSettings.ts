"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUserSettings } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { defaultUserSettings } from "@/lib/mock-data";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * The signed-in user's saved settings (currency, default account, toggles).
 * Shares the "preferences" query key with useApplyUserPreferences, so it reads
 * from the same cache rather than issuing a duplicate fetch.
 */
export function useUserSettings() {
  const { user, isConfigured, isReady } = useAuthReady();

  const { data } = useQuery({
    queryKey: queryKeys.preferences(user?.id),
    queryFn: () => fetchUserSettings(user?.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
    staleTime: 60_000,
  });

  return { settings: data ?? defaultUserSettings };
}
