"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPurposeShare,
  fetchPurposeShares,
  linkPurposeSharesForViewer,
  revokePurposeShare,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

export function usePurposeShares() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.purposeShares(user?.id),
    queryFn: async () => {
      if (!user?.id || !user.email) return [];
      await linkPurposeSharesForViewer(user.id, user.email);
      return fetchPurposeShares(user.id, user.email);
    },
    enabled: (isReady || !isConfigured) && Boolean(user?.id && user.email),
  });

  async function inviteViewer(viewerEmail: string, purposeId: string) {
    const share = await createPurposeShare(user?.id, viewerEmail, purposeId);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.purposeShares(user?.id),
    });
    return share;
  }

  async function removeShare(shareId: string) {
    await revokePurposeShare(user?.id, shareId);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.purposeShares(user?.id),
    });
  }

  return {
    shares: query.data ?? [],
    isLoading: query.isPending && !query.data,
    error: query.error,
    inviteViewer,
    removeShare,
    refresh: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.purposeShares(user?.id),
      }),
  };
}