"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppData } from "@/providers/app-data-provider";
import { afterOutingUpdated } from "@/lib/outing-ledger-sync";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import { getLocalTodayDateStr } from "@/lib/outing-display";
import type { Outing } from "@/types";

export function useOutings() {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const autoExpiredRef = useRef<Set<string>>(new Set());
  const {
    outings,
    outingsLoading,
    addOuting,
    updateOuting,
    removeOuting,
  } = useAppData();

  // Lifecycle reconciliation: auto-complete any active outings whose end date has passed local calendar day
  useEffect(() => {
    if (!user?.id || !outings.length) return;
    const today = getLocalTodayDateStr();
    for (const o of outings) {
      if (
        o.status === "active" &&
        o.isActive !== false &&
        !o.isQuickSplit &&
        o.startDate
      ) {
        const end = o.endDate ? o.endDate.slice(0, 10) : o.startDate.slice(0, 10);
        if (end && today > end && !autoExpiredRef.current.has(o.id)) {
          autoExpiredRef.current.add(o.id);
          void updateOuting({
            ...o,
            status: "completed",
            isActive: false,
          }).catch(() => {});
        }
      }
    }
  }, [outings, user?.id, updateOuting]);

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
    // Rename / date / purpose change → refresh rollup merchant + total on Transactions.
    await afterOutingUpdated(user?.id, saved);
    if (user?.id && saved.id && saved.purposeId) {
      queryClient.setQueryData<any[]>(
        queryKeys.transactions(user.id),
        (current = []) =>
          current.map((tx) =>
            tx.outingId === saved.id
              ? {
                  ...tx,
                  purpose: saved.purposeId!,
                  purposeId: saved.purposeId,
                  splits: tx.splits?.map((s: any) => ({
                    ...s,
                    purposeId: saved.purposeId!,
                  })),
                }
              : tx,
          ),
      );
    }
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