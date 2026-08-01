"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUserMerchants } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

/** Verified merchants for autocomplete — never includes outing-only names. */
export function useMerchants() {
  const { user, isConfigured, isReady } = useAuthReady();

  const query = useQuery({
    queryKey: queryKeys.userMerchants(user?.id),
    queryFn: () => fetchUserMerchants(user?.id),
    enabled: isReady || !isConfigured,
  });

  return {
    merchants: query.data ?? [],
    isLoading: query.isPending && !query.data,
  };
}
