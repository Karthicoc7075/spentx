"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchUserSettings } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { setActiveCurrency, setGlobalPrivateMode } from "@/lib/utils";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Applies the user's display preferences (currency, Private Hiding Mode) to the
 * app-wide formatCurrency singleton, so every amount across the app reflects
 * what's chosen in Settings. Mounted once in AppDataProvider.
 *
 * Applying on load covers a returning user; Settings applies the same setters
 * synchronously on change so the current view updates immediately, and other
 * pages pick up the new value when they next render (e.g. on navigation).
 */
export function useApplyUserPreferences(userId?: string) {
  const { isConfigured, isReady } = useAuthReady();

  const { data: settings } = useQuery({
    queryKey: queryKeys.preferences(userId),
    queryFn: () => fetchUserSettings(userId),
    enabled: (isReady || !isConfigured) && Boolean(userId),
    staleTime: 60_000,
  });

  const currency = settings?.currency;
  const privateMode = settings?.privateMode;

  useEffect(() => {
    if (currency === undefined) return;
    setActiveCurrency(currency);
    setGlobalPrivateMode(Boolean(privateMode));
  }, [currency, privateMode]);
}
