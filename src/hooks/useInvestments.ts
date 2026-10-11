"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  deleteInvestment,
  fetchInvestments,
  saveInvestment,
  subscribeToInvestments,
} from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useShareSession } from "@/providers/share-provider";
import type { Investment } from "@/types";

/** Holdings from public.investments (same rows the mobile app edits). */
export function useInvestments() {
  const { user, isConfigured, isReady } = useAuthReady();
  const share = useShareSession();
  const queryClient = useQueryClient();
  const userId = share ? undefined : user?.id;

  const query = useQuery({
    queryKey: queryKeys.investments(userId),
    queryFn: () => fetchInvestments(userId),
    enabled: (isReady || !isConfigured) && Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToInvestments(userId, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.investments(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.investmentTotal(userId) });
    });
    return unsubscribe;
  }, [userId, queryClient]);

  async function refresh() {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.investments(userId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.investmentTotal(userId) });
    await invalidateFinancialData(queryClient, userId);
  }

  async function save(investment: Investment) {
    if (!userId) throw new Error("You need to be signed in to save investments.");
    try {
      const saved = await saveInvestment(userId, investment);
      queryClient.setQueryData<Investment[]>(queryKeys.investments(userId), (current = []) => {
        const rest = current.filter((item) => item.id !== saved.id);
        return investment.updatedAt
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...rest, saved];
      });
      return saved;
    } finally {
      await refresh();
    }
  }

  async function remove(investmentId: string) {
    if (!userId) throw new Error("You need to be signed in to delete investments.");
    await deleteInvestment(userId, investmentId);
    queryClient.setQueryData<Investment[]>(queryKeys.investments(userId), (current = []) =>
      current.filter((item) => item.id !== investmentId),
    );
    await refresh();
  }

  return {
    investments: query.data ?? [],
    isLoading: query.isPending && !query.data && Boolean(userId),
    error: query.error as Error | null,
    save,
    remove,
  };
}
