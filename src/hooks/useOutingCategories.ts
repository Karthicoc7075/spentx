"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteOutingCategory,
  fetchOutingCategories,
  saveOutingCategory,
} from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { OUTING_CATEGORIES } from "@/types";

export function useOutingCategories() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.outingCategories(user?.id),
    queryFn: () => fetchOutingCategories(user?.id),
    enabled: isReady || !isConfigured,
  });

  const categories =
    query.data?.map((c) => c.name).filter(Boolean) ??
    [...OUTING_CATEGORIES];

  const addCategory = useMutation({
    mutationFn: (name: string) => saveOutingCategory(user?.id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.outingCategories(user?.id),
      });
    },
  });

  const removeCategory = useMutation({
    mutationFn: (categoryId: string) =>
      deleteOutingCategory(user?.id, categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.outingCategories(user?.id),
      });
    },
  });

  return {
    categories,
    rows: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addCategory: (name: string) => addCategory.mutateAsync(name),
    removeCategory: (id: string) => removeCategory.mutateAsync(id),
  };
}
