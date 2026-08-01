"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteOutingExpense,
  fetchOutingExpenses,
  saveOutingExpense,
} from "@/lib/supabase-data";
import { afterOutingExpensesChanged } from "@/lib/outing-ledger-sync";
import { queryKeys } from "@/lib/query-keys";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { OutingExpense } from "@/types";

export function useOutingExpenses(outingId?: string) {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.outingExpenses(user?.id, outingId),
    queryFn: () => fetchOutingExpenses(user?.id, outingId),
    enabled: (isReady || !isConfigured) && Boolean(outingId),
  });

  async function refreshAfterExpenseChange() {
    await afterOutingExpensesChanged(user?.id, outingId);
    await invalidateFinancialData(queryClient, user?.id, { outingId });
  }

  async function addExpense(
    expense: Omit<OutingExpense, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const saved = await saveOutingExpense(user?.id, {
      ...expense,
      id: crypto.randomUUID(),
      userId: user?.id,
    });
    queryClient.setQueryData<OutingExpense[]>(
      queryKeys.outingExpenses(user?.id, outingId),
      (current = []) => [saved, ...current.filter((item) => item.id !== saved.id)],
    );
    await refreshAfterExpenseChange();
    return saved;
  }

  async function updateExpense(expense: OutingExpense) {
    const saved = await saveOutingExpense(user?.id, expense);
    queryClient.setQueryData<OutingExpense[]>(
      queryKeys.outingExpenses(user?.id, outingId),
      (current = []) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
    );
    await refreshAfterExpenseChange();
    return saved;
  }

  async function removeExpense(expenseId: string) {
    await deleteOutingExpense(user?.id, expenseId);
    queryClient.setQueryData<OutingExpense[]>(
      queryKeys.outingExpenses(user?.id, outingId),
      (current = []) => current.filter((item) => item.id !== expenseId),
    );
    await refreshAfterExpenseChange();
  }

  return {
    expenses: query.data ?? [],
    isLoading: query.isPending && !query.data,
    addExpense,
    updateExpense,
    removeExpense,
  };
}