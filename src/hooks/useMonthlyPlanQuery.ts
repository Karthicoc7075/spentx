"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAllMonthlyPlanActuals,
  fetchAllMonthlyPlans,
  fetchMonthlyPlan,
  fetchPlanTemplates,
  fetchSharedMonthlyPlan,
} from "@/lib/supabase-data";
import { getCurrentPlanMonth } from "@/lib/plan";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cacheKeys, readQueryCache, writeQueryCache } from "@/lib/query-cache";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useShareSession } from "@/providers/share-provider";
import type { MonthlyPlan } from "@/types";

export function useMonthlyPlanQuery(
  month = getCurrentPlanMonth(),
  purposeId = PERSONAL_PURPOSE_ID,
) {
  const { user, isConfigured, isReady } = useAuthReady();
  const share = useShareSession();

  return useQuery({
    queryKey: share
      ? queryKeys.sharedMonthlyPlan(share.token, month)
      : queryKeys.monthlyPlan(user?.id, month, purposeId),
    queryFn: async () => {
      const plan = share
        ? await fetchSharedMonthlyPlan(share.token, month)
        : await fetchMonthlyPlan(user?.id, month, purposeId);
      if (!share) {
        writeQueryCache(user?.id, cacheKeys.monthlyPlan(month, purposeId), plan);
      }
      return plan;
    },
    enabled: Boolean(share) || isReady || !isConfigured,
    placeholderData: () => {
      if (share) return undefined;
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

/** All of a user's saved monthly plans, across every month/purpose. */
export function useAllMonthlyPlansQuery() {
  const { user, isConfigured, isReady } = useAuthReady();

  return useQuery({
    queryKey: queryKeys.allMonthlyPlans(user?.id),
    queryFn: () => fetchAllMonthlyPlans(user?.id),
    enabled: isReady || !isConfigured,
  });
}

/** One monthly_plan_actuals row per saved plan — quick actual-vs-planned
 * indicator for the Saved Plans list, without a query per card. */
export function useAllMonthlyPlanActualsQuery() {
  const { user, isConfigured, isReady } = useAuthReady();

  return useQuery({
    queryKey: queryKeys.allMonthlyPlanActuals(user?.id),
    queryFn: () => fetchAllMonthlyPlanActuals(user?.id),
    enabled: isReady || !isConfigured,
  });
}