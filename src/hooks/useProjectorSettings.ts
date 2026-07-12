"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchProjectorSettings,
  saveProjectorSettings,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { FutureSelfInputs } from "@/types";

export function useProjectorSettings() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.projectorSettings(user?.id),
    queryFn: () => fetchProjectorSettings(user?.id),
    enabled: isReady || !isConfigured,
  });

  async function updateSettings(settings: FutureSelfInputs) {
    const saved = await saveProjectorSettings(user?.id, settings);
    queryClient.setQueryData(queryKeys.projectorSettings(user?.id), saved);
    return saved;
  }

  return {
    settings: query.data,
    isLoading: query.isPending && !query.data,
    updateSettings,
  };
}