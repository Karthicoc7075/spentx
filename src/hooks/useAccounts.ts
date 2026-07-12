"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";

export function useAccounts() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const query = useQuery({
    queryKey: queryKeys.accounts(effectiveUserId),
    queryFn: () => fetchAccounts(effectiveUserId),
    enabled: (isReady || !isConfigured) && Boolean(effectiveUserId),
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isPending && !query.data,
    error: query.error,
  };
}