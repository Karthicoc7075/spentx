"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchReflections } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

export function useReflections() {
  const { user, isConfigured, isReady } = useAuthReady();

  const query = useQuery({
    queryKey: queryKeys.reflections(user?.id),
    queryFn: () => fetchReflections(user?.id),
    enabled: isReady || !isConfigured,
  });

  return {
    reflections: query.data ?? [],
    isLoading: query.isPending && !query.data,
    error: query.error,
    refetch: query.refetch,
  };
}