"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteIncomeStream,
  fetchIncomeStreams,
  saveIncomeStream,
} from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { IncomeStream } from "@/types";

export function useIncomeStreams() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.incomeStreams(user?.id),
    queryFn: () => fetchIncomeStreams(user?.id),
    enabled: isReady || !isConfigured,
  });

  async function addStream(
    stream: Omit<IncomeStream, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const saved = await saveIncomeStream(user?.id, {
      ...stream,
      id: crypto.randomUUID(),
      userId: user?.id,
    });
    queryClient.setQueryData<IncomeStream[]>(
      queryKeys.incomeStreams(user?.id),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    return saved;
  }

  async function updateStream(stream: IncomeStream) {
    const saved = await saveIncomeStream(user?.id, stream);
    queryClient.setQueryData<IncomeStream[]>(
      queryKeys.incomeStreams(user?.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    return saved;
  }

  async function removeStream(streamId: string) {
    await deleteIncomeStream(user?.id, streamId);
    queryClient.setQueryData<IncomeStream[]>(
      queryKeys.incomeStreams(user?.id),
      (current = []) => current.filter((item) => item.id !== streamId),
    );
  }

  return {
    streams: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addStream,
    updateStream,
    removeStream,
  };
}