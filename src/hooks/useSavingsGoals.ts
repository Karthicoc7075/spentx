"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  addGoalContribution,
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
      updatedAt: undefined,
    });
    queryClient.setQueryData<SavingsGoal[]>(
      queryKeys.savingsGoals(userId),
      (current = []) => [...current.filter((item) => item.id !== saved.id), saved],
    );
    await syncFromDatabase();
    return saved;
  }

  async function updateGoal(goal: SavingsGoal) {
    if (!userId) {
      throw new Error("You need to be signed in to update a savings goal.");
    }
    let saved: SavingsGoal;
    try {
      saved = await saveSavingsGoal(userId, goal);
    } catch (error) {
      // Stale edit (changed on another device): reload the latest version.
      await syncFromDatabase();
      throw error;
    }
    queryClient.setQueryData<SavingsGoal[]>(
      queryKeys.savingsGoals(userId),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    await syncFromDatabase();
    return saved;
  }

  /** Atomic server-side deposit (add_goal_contribution RPC). */
  async function addFunds(
    goalId: string,
    amount: number,
    options: { transactionId?: string; note?: string } = {},
  ) {
    if (!userId) {
      throw new Error("You need to be signed in to add to a savings goal.");
    }
    const saved = await addGoalContribution(userId, goalId, amount, options);
    if (saved) {
      queryClient.setQueryData<SavingsGoal[]>(
        queryKeys.savingsGoals(userId),
        (current = []) => current.map((item) => (item.id === saved.id ? saved : item)),
      );
    }
    await syncFromDatabase();
    return saved;
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
