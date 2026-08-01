"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPurposes, fetchSharedPurposes } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useShareSession } from "@/providers/share-provider";
import { useViewerAccess } from "@/providers/viewer-provider";

export function usePurposes() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId, isReadOnlyViewer, sharedPurposeIds } = useViewerAccess();
  const share = useShareSession();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const query = useQuery({
    queryKey: share
      ? queryKeys.sharedPurposes(share.token)
      : queryKeys.purposes(effectiveUserId),
    queryFn: () =>
      share ? fetchSharedPurposes(share.token) : fetchPurposes(effectiveUserId),
    enabled: Boolean(share) || ((isReady || !isConfigured) && Boolean(effectiveUserId)),
  });

  const purposes = useMemo(() => {
    const all = query.data ?? [];
    if (!isReadOnlyViewer) return all;
    return all.filter((purpose) => sharedPurposeIds.includes(purpose.id));
  }, [isReadOnlyViewer, query.data, sharedPurposeIds]);

  return {
    purposes,
    isLoading: query.isPending && !query.data,
    error: query.error,
  };
}