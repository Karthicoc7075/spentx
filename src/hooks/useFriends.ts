"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFriend, fetchFriends, saveFriend } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { Friend } from "@/types";

export function useFriends() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.friends(user?.id),
    queryFn: () => fetchFriends(user?.id),
    enabled: isReady || !isConfigured,
  });

  async function addFriend(
    friend: Omit<Friend, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const saved = await saveFriend(user?.id, {
      ...friend,
      id: crypto.randomUUID(),
      userId: user?.id,
    });
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user?.id),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    return saved;
  }

  async function updateFriend(friend: Friend) {
    const saved = await saveFriend(user?.id, friend);
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user?.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    return saved;
  }

  async function removeFriend(friendId: string) {
    await deleteFriend(user?.id, friendId);
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user?.id),
      (current = []) => current.filter((item) => item.id !== friendId),
    );
  }

  return {
    friends: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addFriend,
    updateFriend,
    removeFriend,
  };
}