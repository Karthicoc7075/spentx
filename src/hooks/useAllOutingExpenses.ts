"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOutingExpenses } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

import { useShareSession } from "@/providers/share-provider";

export function useAllOutingExpenses() {
  const { user, isConfigured, isReady } = useAuthReady();
  const share = useShareSession();

  const query = useQuery({
    queryKey: queryKeys.allOutingExpenses(user?.id),
    queryFn: () => fetchOutingExpenses(user?.id),
    enabled: !share && (isReady || !isConfigured) && Boolean(user?.id),
  });

  return {
    expenses: share ? [] : (query.data ?? []),
    isLoading: !share && query.isPending && !query.data,
  };
}