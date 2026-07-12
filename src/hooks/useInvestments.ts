"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteInvestment,
  fetchInvestments,
  saveInvestment,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { Investment } from "@/types";
import { cacheKeys, readQueryCache } from "@/lib/query-cache";

export function useInvestments() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.investments(user?.id),
    queryFn: () => fetchInvestments(user?.id),
    enabled: isReady || !isConfigured,
    placeholderData: (previousData) => {
      if (previousData !== undefined) return previousData;
      return readQueryCache<Investment[]>(user?.id, cacheKeys.investments) ?? [];
    },
  });

  async function addInvestment(
    investment: Omit<Investment, "id" | "userId" | "createdAt" | "updatedAt">,
    id = crypto.randomUUID(),
  ) {
    const saved = await saveInvestment(user?.id, {
      ...investment,
      id,
      userId: user?.id,
    });
    queryClient.setQueryData<Investment[]>(
      queryKeys.investments(user?.id),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    return saved;
  }

  async function updateInvestment(investment: Investment) {
    const saved = await saveInvestment(user?.id, investment);
    queryClient.setQueryData<Investment[]>(
      queryKeys.investments(user?.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    return saved;
  }

  async function removeInvestment(investmentId: string) {
    await deleteInvestment(user?.id, investmentId);
    queryClient.setQueryData<Investment[]>(
      queryKeys.investments(user?.id),
      (current = []) => current.filter((item) => item.id !== investmentId),
    );
  }

  return {
    investments: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addInvestment,
    updateInvestment,
    removeInvestment,
  };
}