"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOutingExpenses } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

export function useAllOutingExpenses() {
  const { user, isConfigured, isReady } = useAuthReady();

  const query = useQuery({
    queryKey: queryKeys.allOutingExpenses(user?.id),
    queryFn: () => fetchOutingExpenses(user?.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });

  return {
    expenses: query.data ?? [],
    isLoading: query.isPending && !query.data,
  };
}