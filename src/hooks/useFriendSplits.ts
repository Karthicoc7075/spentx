"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteFriendSettlement,
  deleteFriendSplit,
  fetchFriendSettlements,
  fetchFriendSplits,
  saveFriendSettlement,
  saveFriendSplit,
} from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { FriendSettlement, FriendSplit } from "@/types";

/**
 * Friend splits are standalone shared expenses — no outing is involved, so
 * nothing here touches the outing ledger sync.
 */
export function useFriendSplits() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();
  const enabled = isReady || !isConfigured;

  const splitsQuery = useQuery({
    queryKey: queryKeys.allFriendSplits(user?.id),
    queryFn: () => fetchFriendSplits(user?.id),
    enabled,
  });

  const settlementsQuery = useQuery({
    queryKey: queryKeys.allFriendSettlements(user?.id),
    queryFn: () => fetchFriendSettlements(user?.id),
    enabled,
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.allFriendSplits(user?.id),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.allFriendSettlements(user?.id),
    });
    await invalidateFinancialData(queryClient, user?.id);
  }

  async function saveSplit(
    split: Omit<FriendSplit, "id" | "userId" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ) {
    const saved = await saveFriendSplit(user?.id, {
      ...split,
      id: split.id ?? crypto.randomUUID(),
      userId: user?.id,
    });
    await refresh();
    return saved;
  }

  async function removeSplit(splitId: string) {
    await deleteFriendSplit(user?.id, splitId);
    await refresh();
  }

  async function addSettlement(
    settlement: Omit<FriendSettlement, "id" | "userId" | "createdAt">,
  ) {
    const saved = await saveFriendSettlement(user?.id, {
      ...settlement,
      id: crypto.randomUUID(),
      userId: user?.id,
    });
    await refresh();
    return saved;
  }

  async function removeSettlement(id: string) {
    await deleteFriendSettlement(user?.id, id);
    await refresh();
  }

  return {
    splits: splitsQuery.data ?? [],
    settlements: settlementsQuery.data ?? [],
    isLoading: splitsQuery.isPending && !splitsQuery.data,
    saveSplit,
    removeSplit,
    addSettlement,
    removeSettlement,
  };
}
