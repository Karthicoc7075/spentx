"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchUserSettings } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { setGlobalPrivateMode } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Applies the user's display preferences (Private Hiding Mode) to the app-wide
 * formatCurrency singleton, so every amount across the app reflects what's
 * chosen in Settings. Mounted once in AppDataProvider.
 *
 * Currency is fixed to INR (spec Step 8.2), so only Private Hiding Mode is
 * applied here now.
 */
export function useApplyUserPreferences(userId?: string) {
  const { isConfigured, isReady } = useAuthReady();

  const { data: settings } = useQuery({
    queryKey: queryKeys.preferences(userId),
    queryFn: () => fetchUserSettings(userId),
    enabled: (isReady || !isConfigured) && Boolean(userId),
    staleTime: 60_000,
  });

  const privateMode = settings?.privateMode;

  useEffect(() => {
    if (privateMode === undefined) return;
    setGlobalPrivateMode(Boolean(privateMode));
  }, [privateMode]);
}
