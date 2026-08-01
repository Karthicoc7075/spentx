"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOutingSettlements, saveOutingSettlement } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { OutingSettlement } from "@/types";

export function useOutingSettlements(outingId?: string) {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.outingSettlements(user?.id, outingId),
    queryFn: () => fetchOutingSettlements(user?.id, outingId),
    enabled: (isReady || !isConfigured) && Boolean(outingId),
  });

  async function addSettlement(
    settlement: Omit<OutingSettlement, "id" | "userId" | "createdAt">,
  ) {
    const saved = await saveOutingSettlement(user?.id, {
      ...settlement,
      id: crypto.randomUUID(),
      userId: user?.id,
    });
    queryClient.setQueryData<OutingSettlement[]>(
      queryKeys.outingSettlements(user?.id, outingId),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    await invalidateFinancialData(queryClient, user?.id, { outingId });
    return saved;
  }

  return {
    settlements: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addSettlement,
  };
}