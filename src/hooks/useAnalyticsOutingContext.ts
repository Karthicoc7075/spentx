"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOutingExpenses } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useOutings } from "@/hooks/useOutings";
import type { AnalyticsFilterContext } from "@/lib/analytics-filters";

export function useAnalyticsOutingContext(): AnalyticsFilterContext {
  const { user, isConfigured, isReady } = useAuthReady();
  const { outings } = useOutings();

  const expensesQuery = useQuery({
    queryKey: queryKeys.outingExpenses(user?.id),
    queryFn: () => fetchOutingExpenses(user?.id),
    enabled: isReady || !isConfigured,
  });

  return {
    outings,
    outingExpenses: expensesQuery.data ?? [],
  };
}