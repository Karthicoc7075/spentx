"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSmartView,
  fetchSmartViews,
  saveSmartView,
} from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { SmartView } from "@/types";

export type SmartViewDraft = {
  name: string;
  accountId: string | null;
  purposeId: string | null;
  categoryIds: string[];
  contributorId: string | null;
};

export function useSmartViews() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.smartViews(user?.id),
    queryFn: () => fetchSmartViews(user?.id),
    enabled: isReady || !isConfigured,
  });

  const smartViews = query.data ?? [];

  async function addSmartView(draft: SmartViewDraft) {
    const saved = await saveSmartView(user?.id, draft);
    queryClient.setQueryData<SmartView[]>(
      queryKeys.smartViews(user?.id),
      (current = []) => [saved, ...current],
    );
    return saved;
  }

  async function updateSmartView(id: string, draft: SmartViewDraft) {
    const saved = await saveSmartView(user?.id, { ...draft, id });
    queryClient.setQueryData<SmartView[]>(
      queryKeys.smartViews(user?.id),
      (current = []) => current.map((item) => (item.id === id ? saved : item)),
    );
    return saved;
  }

  async function removeSmartView(id: string) {
    await deleteSmartView(user?.id, id);
    queryClient.setQueryData<SmartView[]>(
      queryKeys.smartViews(user?.id),
      (current = []) => current.filter((item) => item.id !== id),
    );
  }

  return {
    smartViews,
    isLoading: query.isPending && !query.data,
    addSmartView,
    updateSmartView,
    removeSmartView,
  };
}
