"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchAllFriends } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Ids of soft-deleted friends. Past outings and splits keep referencing them,
 * so every historical surface uses this to render "Sanjay (Deleted)" instead
 * of dropping the member and breaking the totals.
 */
export function useDeletedFriends() {
  const { user, isConfigured, isReady } = useAuthReady();

  const query = useQuery({
    queryKey: queryKeys.allFriends(user?.id),
    queryFn: () => fetchAllFriends(user?.id),
    enabled: isReady || !isConfigured,
  });

  const deletedFriendIds = useMemo(
    () =>
      new Set(
        (query.data ?? [])
          .filter((friend) => friend.isActive === false)
          .map((friend) => friend.id),
      ),
    [query.data],
  );

  return { deletedFriendIds, allFriends: query.data ?? [] };
}
