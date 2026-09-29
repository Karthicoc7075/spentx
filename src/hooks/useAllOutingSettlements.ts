"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOutingSettlements } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

export function useAllOutingSettlements() {
  const { user, isConfigured, isReady } = useAuthReady();

  const query = useQuery({
    queryKey: queryKeys.allOutingSettlements(user?.id),
    queryFn: () => fetchOutingSettlements(user?.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });

  return {
    settlements: query.data ?? [],
    isLoading: query.isPending && !query.data,
  };
}
