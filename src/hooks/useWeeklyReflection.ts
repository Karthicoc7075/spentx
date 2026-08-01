"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchReflection, saveReflection } from "@/lib/supabase-data";
import { calculateWeeklyPlanAdherence, getWeekStart } from "@/lib/journal";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { useTransactions } from "@/hooks/useTransactions";
import { getCurrentPlanMonth } from "@/lib/plan";
import type { Reflection } from "@/types";

export function useWeeklyReflection(weekStart = getWeekStart()) {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();
  const { transactions } = useTransactions();
  const planQuery = useMonthlyPlanQuery(getCurrentPlanMonth());

  const query = useQuery({
    queryKey: queryKeys.reflection(user?.id, weekStart),
    queryFn: () => fetchReflection(user?.id, weekStart),
    enabled: isReady || !isConfigured,
  });

  const planAdherence = useMemo(
    () =>
      calculateWeeklyPlanAdherence(
        transactions,
        weekStart,
        planQuery.data ?? null,
      ),
    [planQuery.data, transactions, weekStart],
  );

  async function persistReflection(
    values: Omit<Reflection, "id" | "userId" | "createdAt" | "updatedAt">,
    aiSummary?: string,
  ) {
    const saved = await saveReflection(user?.id, {
      ...values,
      id: weekStart,
      userId: user?.id,
      planAdherence: values.planAdherence || planAdherence,
      aiSummary,
    });

    queryClient.setQueryData(queryKeys.reflection(user?.id, weekStart), saved);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.reflections(user?.id),
    });

    return saved;
  }

  return {
    reflection: query.data ?? null,
    isLoading: query.isPending && !query.data,
    planAdherence,
    persistReflection,
    refetch: query.refetch,
  };
}