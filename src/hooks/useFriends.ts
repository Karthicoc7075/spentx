"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFriend, fetchFriends, saveFriend } from "@/lib/supabase-data";
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

  /**
   * Re-reads the friends list from the database after every write, so what
   * the UI shows is what was actually persisted. Without this a write that
   * silently failed would leave an optimistic row on screen that vanishes on
   * the next page load.
   */
  async function syncFromDatabase() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.friends(user?.id) });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.allFriends(user?.id),
    });
  }

  async function addFriend(
    friend: Omit<Friend, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    if (!user?.id) {
      throw new Error("You need to be signed in to add a friend.");
    }
    const saved = await saveFriend(user.id, {
      ...friend,
      id: crypto.randomUUID(),
      userId: user.id,
    });
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user.id),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    await syncFromDatabase();
    return saved;
  }

  async function updateFriend(friend: Friend) {
    if (!user?.id) {
      throw new Error("You need to be signed in to update a friend.");
    }
    const saved = await saveFriend(user.id, friend);
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user.id),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    await syncFromDatabase();
    return saved;
  }

  async function removeFriend(friendId: string) {
    if (!user?.id) {
      throw new Error("You need to be signed in to delete a friend.");
    }
    await deleteFriend(user.id, friendId);
    queryClient.setQueryData<Friend[]>(
      queryKeys.friends(user.id),
      (current = []) => current.filter((item) => item.id !== friendId),
    );
    await syncFromDatabase();
  }

  return {
    friends: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addFriend,
    updateFriend,
    removeFriend,
  };
}