"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAppData } from "@/providers/app-data-provider";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { Outing } from "@/types";

export function useOutings() {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const {
    outings,
    outingsLoading,
    addOuting,
    updateOuting,
    removeOuting,
  } = useAppData();

  async function addOutingWithCache(
    outing: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const saved = await addOuting(outing);
    queryClient.setQueryData<Outing[]>(
      queryKeys.outings(user?.id),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    return saved;
  }

  async function updateOutingWithCache(outing: Outing) {
    const saved = await updateOuting(outing);
    queryClient.setQueryData<Outing[]>(
      queryKeys.outings(user?.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    return saved;
  }

  async function removeOutingWithCache(outingId: string) {
    await removeOuting(outingId);
    queryClient.setQueryData<Outing[]>(
      queryKeys.outings(user?.id),
      (current = []) => current.filter((item) => item.id !== outingId),
    );
  }

  return {
    outings,
    isLoading: outingsLoading && outings.length === 0,
    addOuting: addOutingWithCache,
    updateOuting: updateOutingWithCache,
    removeOuting: removeOutingWithCache,
  };
}