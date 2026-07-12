"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMonthlyPlan, fetchPlanTemplates } from "@/lib/firebase";
import { getCurrentPlanMonth } from "@/lib/plan";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { MonthlyPlan } from "@/types";

export function useMonthlyPlanQuery(
  month = getCurrentPlanMonth(),
  purposeId = PERSONAL_PURPOSE_ID,
) {
  const { user, isConfigured, isReady } = useAuthReady();

  return useQuery({
    queryKey: queryKeys.monthlyPlan(user?.id, month, purposeId),
    queryFn: async () => {
      const plan = await fetchMonthlyPlan(user?.id, month, purposeId);
      writeQueryCache(
        user?.id,
        cacheKeys.monthlyPlan(month, purposeId),
        plan,
      );
      return plan;
    },
    enabled: isReady || !isConfigured,
    placeholderData: (previousData) => {
      if (previousData !== undefined) return previousData;
      return readQueryCache<MonthlyPlan | null>(
        user?.id,
        cacheKeys.monthlyPlan(month, purposeId),
      );
    },
  });
}

export function usePlanTemplatesQuery() {
  const { user, isConfigured, isReady } = useAuthReady();

  return useQuery({
    queryKey: queryKeys.planTemplates(user?.id),
    queryFn: () => fetchPlanTemplates(user?.id),
    enabled: isReady || !isConfigured,
  });
}