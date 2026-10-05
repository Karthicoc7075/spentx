"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  deleteSavingsGoal,
  fetchSavingsGoals,
  saveSavingsGoal,
  subscribeToSavingsGoals,
} from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { SavingsGoal } from "@/types";

export function useSavingsGoals() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.savingsGoals(userId),
    queryFn: () => fetchSavingsGoals(userId),
    enabled: (isReady || !isConfigured) && Boolean(userId),
  });

  // Real-time synchronization listener for live updates from Mobile app
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToSavingsGoals(userId, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.investmentTotal(userId) });
    });
    return () => {
      unsubscribe();
    };
  }, [userId, queryClient]);

  async function syncFromDatabase() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals(userId) });
    if (userId) {
      await invalidateFinancialData(queryClient, userId);
    }
  }

  async function addGoal(
    goal: Omit<SavingsGoal, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    if (!userId) {
      throw new Error("You need to be signed in to add a savings goal.");
    }
    const saved = await saveSavingsGoal(userId, {
      ...goal,
      id: crypto.randomUUID(),
      userId,
      savedAmount: goal.savedAmount ?? 0,
    });
    queryClient.setQueryData<SavingsGoal[]>(
      queryKeys.savingsGoals(userId),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    await syncFromDatabase();
    return saved;
  }

  async function updateGoal(goal: SavingsGoal) {
    if (!userId) {
      throw new Error("You need to be signed in to update a savings goal.");
    }
    const saved = await saveSavingsGoal(userId, goal);
    queryClient.setQueryData<SavingsGoal[]>(
      queryKeys.savingsGoals(userId),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    await syncFromDatabase();
    return saved;
  }

  async function addFunds(goalId: string, amount: number) {
    const goals = query.data ?? [];
    const target = goals.find((g) => g.id === goalId);
    if (!target) return;
    const updated: SavingsGoal = {
      ...target,
      savedAmount: Number((target.savedAmount + amount).toFixed(2)),
    };
    return updateGoal(updated);
  }

  async function removeGoal(goalId: string) {
    if (!userId) {
      throw new Error("You need to be signed in to delete a savings goal.");
    }
    await deleteSavingsGoal(userId, goalId);
    queryClient.setQueryData<SavingsGoal[]>(
      queryKeys.savingsGoals(userId),
      (current = []) => current.filter((item) => item.id !== goalId),
    );
    await syncFromDatabase();
  }

  return {
    goals: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addGoal,
    updateGoal,
    addFunds,
    removeGoal,
  };
}
