"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDeletedOutings, restoreOuting } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";

export function useDeletedOutings() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.deletedOutings(user?.id),
    queryFn: () => fetchDeletedOutings(user?.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });

  async function restore(outingId: string) {
    await restoreOuting(user?.id, outingId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.deletedOutings(user?.id) });
    await invalidateFinancialData(queryClient, user?.id, { outingId });
  }

  return {
    deletedOutings: query.data ?? [],
    isLoading: query.isPending && !query.data,
    restore,
  };
}
