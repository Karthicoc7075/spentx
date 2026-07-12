"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultIncomeTargets } from "@/lib/growth";
import { fetchIncomeTargets, saveIncomeTargets } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { IncomeTargets } from "@/types";

export function useIncomeTargets() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.incomeTargets(user?.id),
    queryFn: () => fetchIncomeTargets(user?.id),
    enabled: isReady || !isConfigured,
  });

  async function updateTargets(targets: IncomeTargets) {
    const saved = await saveIncomeTargets(user?.id, targets);
    queryClient.setQueryData(queryKeys.incomeTargets(user?.id), saved);
    return saved;
  }

  return {
    targets: query.data ?? defaultIncomeTargets,
    isLoading: query.isPending && !query.data,
    updateTargets,
  };
}