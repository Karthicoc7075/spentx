"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOutingExpenses } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useOutings } from "@/hooks/useOutings";
import type { AnalyticsFilterContext } from "@/lib/analytics-filters";

export function useAnalyticsOutingContext(): AnalyticsFilterContext {
  const { user, isConfigured, isReady } = useAuthReady();
  const { outings } = useOutings();

  const expensesQuery = useQuery({
    // All outings' expenses — Analysis folds them into Trip/Temple totals.
    queryKey: queryKeys.allOutingExpenses(user?.id),
    queryFn: () => fetchOutingExpenses(user?.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });

  return {
    outings,
    outingExpenses: expensesQuery.data ?? [],
  };
}