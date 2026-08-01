"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAppData } from "@/providers/app-data-provider";
import { afterOutingUpdated } from "@/lib/outing-ledger-sync";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
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
    await invalidateFinancialData(queryClient, user?.id, { outingId: saved.id });
    return saved;
  }

  async function updateOutingWithCache(outing: Outing) {
    const saved = await updateOuting(outing);
    queryClient.setQueryData<Outing[]>(
      queryKeys.outings(user?.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    // Rename / date change → refresh rollup merchant + total on Transactions.
    await afterOutingUpdated(user?.id, saved);
    await invalidateFinancialData(queryClient, user?.id, { outingId: saved.id });
    return saved;
  }

  async function removeOutingWithCache(outingId: string) {
    // removeOuting → deleteOuting → cascade_delete_outing RPC (soft-deletes
    // the outing + its transactions + outing_expenses + settlements atomically).
    await removeOuting(outingId);
    queryClient.setQueryData<Outing[]>(
      queryKeys.outings(user?.id),
      (current = []) => current.filter((item) => item.id !== outingId),
    );
    await invalidateFinancialData(queryClient, user?.id, { outingId });
  }

  return {
    outings,
    isLoading: outingsLoading && outings.length === 0,
    addOuting: addOutingWithCache,
    updateOuting: updateOutingWithCache,
    removeOuting: removeOutingWithCache,
  };
}