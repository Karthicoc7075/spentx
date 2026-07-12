"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteContributor,
  fetchContributors,
  saveContributor,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { Contributor } from "@/types";

export function useContributors() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.contributors(user?.id),
    queryFn: () => fetchContributors(user?.id),
    enabled: isReady || !isConfigured,
  });

  const contributors = query.data ?? [];

  async function addContributor(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const saved = await saveContributor(user?.id, {
      id: crypto.randomUUID(),
      name: trimmed,
      isDefault: false,
    });
    queryClient.setQueryData<Contributor[]>(
      queryKeys.contributors(user?.id),
      (current = []) => [...current, saved],
    );
    return saved;
  }

  async function removeContributor(contributorId: string) {
    const target = contributors.find((item) => item.id === contributorId);
    if (target?.isDefault) return; // "Me" is permanent.

    await deleteContributor(user?.id, contributorId);
    queryClient.setQueryData<Contributor[]>(
      queryKeys.contributors(user?.id),
      (current = []) => current.filter((item) => item.id !== contributorId),
    );
  }

  const defaultContributor =
    contributors.find((item) => item.isDefault) ?? contributors[0] ?? null;

  return {
    contributors,
    isLoading: query.isPending && !query.data,
    defaultContributorName: defaultContributor?.name ?? "Me",
    addContributor,
    removeContributor,
  };
}
