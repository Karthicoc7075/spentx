"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteBalanceSnapshot,
  fetchBalanceSnapshots,
  saveBalanceSnapshot,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { BalanceSnapshot } from "@/types";

export function useBalanceSnapshots(accountId?: string) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.balanceSnapshots(user?.id, accountId),
    queryFn: () => fetchBalanceSnapshots(user?.id, accountId),
    enabled: Boolean(user?.id),
  });

  async function addSnapshot(
    values: Omit<BalanceSnapshot, "id" | "userId" | "createdAt"> & {
      userId?: string;
    },
  ) {
    if (!user?.id) return null;

    const saved = await saveBalanceSnapshot(user.id, {
      ...values,
      userId: user.id,
    });

    await queryClient.invalidateQueries({
      queryKey: queryKeys.balanceSnapshots(user.id),
    });

    return saved;
  }

  async function removeSnapshot(snapshotId: string) {
    await deleteBalanceSnapshot(snapshotId);
    if (user?.id) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.balanceSnapshots(user.id),
      });
    }
  }

  return {
    snapshots: query.data ?? [],
    isLoading: query.isLoading,
    addSnapshot,
    removeSnapshot,
    refetch: query.refetch,
  };
}