"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPurposes } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useViewerAccess } from "@/providers/viewer-provider";

export function usePurposes() {
  const { user, isConfigured, isReady } = useAuthReady();
  const { dataOwnerId, isReadOnlyViewer, sharedPurposeIds } = useViewerAccess();
  const effectiveUserId = dataOwnerId ?? user?.id;

  const query = useQuery({
    queryKey: queryKeys.purposes(effectiveUserId),
    queryFn: () => fetchPurposes(effectiveUserId),
    enabled: (isReady || !isConfigured) && Boolean(effectiveUserId),
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