"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPurposeShare,
  fetchPurposeShares,
  linkPurposeSharesForViewer,
  revokePurposeShare,
} from "@/lib/supabase-data";
import { usePathname } from "next/navigation";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";

export function usePurposeShares() {
  const pathname = usePathname();
  const isBypassedRoute = pathname.startsWith("/share") || pathname.startsWith("/admin");
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.purposeShares(user?.id),
    queryFn: async () => {
      if (!user?.id || !user.email) return [];
      try {
        await linkPurposeSharesForViewer(user.id, user.email);
      } catch {
        // Non-fatal: viewer linking can fail before invite policies are applied.
      }
      return fetchPurposeShares(user.id, user.email);
    },
    enabled: (isReady || !isConfigured) && Boolean(user?.id && user.email) && !isBypassedRoute,
  });

  async function inviteViewer(
    viewerEmail: string,
    purposeId: string,
    linkToken?: string,
    contributorId?: string | null,
    expiresAt?: string | null,
  ) {
    const share = await createPurposeShare(
      user?.id,
      viewerEmail,
      purposeId,
      linkToken,
      contributorId,
      expiresAt,
    );
    await queryClient.invalidateQueries({
      queryKey: queryKeys.purposeShares(user?.id),
    });
    return share;
  }

  async function removeShare(shareId: string, purposeId?: string, viewerEmail?: string) {
    await revokePurposeShare(user?.id, shareId, purposeId, viewerEmail);
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