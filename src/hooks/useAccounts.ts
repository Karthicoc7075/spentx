"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccounts, subscribeToAccountChanges } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";

export function useAccounts() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.accounts(effectiveUserId),
    queryFn: () => fetchAccounts(effectiveUserId),
    enabled: (isReady || !isConfigured) && Boolean(effectiveUserId),
  });

  // Live coverage: without this, an account create/edit/delete on another
  // device or tab only reached Dashboard/Wealth after the 10-minute global
  // staleTime lapsed (refetchOnWindowFocus/refetchOnMount are both off).
  useEffect(() => {
    if (!effectiveUserId) return;
    return subscribeToAccountChanges(effectiveUserId, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts(effectiveUserId) });
    });
  }, [effectiveUserId, queryClient]);

  return {
    accounts: query.data ?? [],
    isLoading: query.isPending && !query.data,
    error: query.error,
  };
}