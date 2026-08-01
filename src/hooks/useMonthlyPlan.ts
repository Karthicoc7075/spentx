"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyPlanSuggestions,
  applyActualsToBudget,
  autoBalanceAllocations,
  buildIncomeIdeas,
  buildPlanSuggestions,
  computeCategorySpentActuals,
  computeEffectiveBudget,
  createEmptyPlan,
  formatDefaultPlanTitle,
  getCurrentPlanMonth,
  getPlanBudgetStatus,
  getPlanDelta,
  getUtilization,
  shiftPlanMonth,
  suggestExpectedIncome,
  sumPlanned,
  sumPlannedForBuffer,
  type RolloverBreakdown,
} from "@/lib/plan";
import { deleteMonthlyPlan, saveMonthlyPlan } from "@/lib/supabase-data";
import { defaultCategories } from "@/lib/mock-data";
import {
  getDefaultPersonalPurpose,
  PERSONAL_PURPOSE_ID,
  transactionMatchesPurpose,
} from "@/lib/purposes";
import { queryKeys } from "@/lib/query-keys";
import { useCategories } from "@/hooks/useCategories";
import { usePurposes } from "@/hooks/usePurposes";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useTransactions } from "@/hooks/useTransactions";
import type { MonthlyPlan, PlanAllocation } from "@/types";

const categoryPalette = ["#38bdf8", "#f97316", "#a855f7", "#ec4899", "#6366f1"];

export function useMonthlyPlan(
  initialMonth = getCurrentPlanMonth(),
  initialPurposeId = PERSONAL_PURPOSE_ID,
) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();
  const { categories } = useCategories();
  const { purposes } = usePurposes();
  const { transactions: allTransactions } = useTransactions();
  const [month, setMonth] = useState(initialMonth);
  const [purposeId, setPurposeId] = useState(initialPurposeId);
  const [expectedIncome, setExpectedIncome] = useState(0);
  const [allocations, setAllocations] = useState<PlanAllocation[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showIncomeIdeas, setShowIncomeIdeas] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedMonthRef = useRef<string | null>(null);

  const planQuery = useMonthlyPlanQuery(month, purposeId);
  const previousMonth = useMemo(() => shiftPlanMonth(month, -1), [month]);
  const previousPlanQuery = useMonthlyPlanQuery(previousMonth, purposeId);

  const purposeTransactions = useMemo(
    () =>
      allTransactions.filter((transaction) =>
        transactionMatchesPurpose(transaction.purpose, purposeId, purposes),
      ),
    [allTransactions, purposeId, purposes],
  );

  const incomeSuggestion = useMemo(
    () => suggestExpectedIncome(purposeTransactions),
    [purposeTransactions],
  );

  useEffect(() => {
    hydratedMonthRef.current = null;
    setIsEditing(false);
    setExpectedIncome(0);
    setAllocations([]);
    setActiveCategory(null);
  }, [month, purposeId]);

  useEffect(() => {
    if (purposeId !== PERSONAL_PURPOSE_ID || purposes.length === 0) return;
    const defaultPersonal = getDefaultPersonalPurpose(purposes);
    if (defaultPersonal?.id) {
      setPurposeId(defaultPersonal.id);
    }
  }, [purposes, purposeId]);

  const savedPlan = planQuery.data ?? null;
  const hasSavedPlan = Boolean(savedPlan);
  const isActivePlan = month === getCurrentPlanMonth();
  const isBudgetLocked = savedPlan?.isBudgetLocked ?? false;
  const budgetSetAt = savedPlan?.budgetSetAt;
  const isViewMode = hasSavedPlan && !isEditing;

  useEffect(() => {
    const resolvedCategories =
      categories.length > 0 ? categories : defaultCategories;

    function mergeAllocations(current: PlanAllocation[], next: PlanAllocation[]) {
      const amounts = new Map(
        current.map((item) => [item.category, item.plannedAmount]),
      );
      return next.map((item) => ({
        ...item,
        plannedAmount: amounts.get(item.category) ?? item.plannedAmount,
      }));
    }

    if (planQuery.isPending) return;

    const hydrationKey = `${month}:${purposeId}`;
    if (hydratedMonthRef.current === hydrationKey && planQuery.data) return;

    const plan = planQuery.data;
    if (plan) {
      setExpectedIncome(plan.expectedIncome);
      setAllocations(plan.allocations);
      hydratedMonthRef.current = hydrationKey;
      return;
    }

    const empty = createEmptyPlan(month, resolvedCategories);
    setExpectedIncome(incomeSuggestion);
    setAllocations((current) =>
      hydratedMonthRef.current === hydrationKey
        ? mergeAllocations(current, empty.allocations)
        : empty.allocations,
    );
    hydratedMonthRef.current = hydrationKey;
  }, [
    categories,
    incomeSuggestion,
    month,
    purposeId,
    planQuery.data,
    planQuery.isPending,
  ]);

  const isLoading = planQuery.isPending;

  const totalPlanned = useMemo(() => sumPlanned(allocations), [allocations]);
  const bufferPlanned = useMemo(
    () => sumPlannedForBuffer(allocations),
    [allocations],
  );
  const status = useMemo(
    () => getPlanBudgetStatus(bufferPlanned, expectedIncome),
    [bufferPlanned, expectedIncome],
  );
  const delta = useMemo(
    () => getPlanDelta(bufferPlanned, expectedIncome),
    [bufferPlanned, expectedIncome],
  );
  const utilization = useMemo(
    () => getUtilization(bufferPlanned, expectedIncome),
    [bufferPlanned, expectedIncome],
  );
  const shortfall = delta < 0 ? Math.abs(delta) : 0;
  const suggestions = useMemo(
    () => buildPlanSuggestions(allocations, shortfall),
    [allocations, shortfall],
  );
  const incomeIdeas = useMemo(
    () => buildIncomeIdeas(expectedIncome, shortfall),
    [expectedIncome, shortfall],
  );

  const actualSummarySuggestion = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let totalIncome = 0;
    let totalExpense = 0;
    const categorySpentMap: Record<string, number> = {};
    
    purposeTransactions.forEach((tx) => {
      const txDate = new Date(tx.transactionDate ?? tx.date ?? "");
      if (txDate >= thirtyDaysAgo) {
        if (tx.type === "income") {
          totalIncome += tx.amount;
        } else {
          totalExpense += tx.amount;
          categorySpentMap[tx.category] = (categorySpentMap[tx.category] || 0) + tx.amount;
        }
      }
    });

    return {
      income: totalIncome || incomeSuggestion || 50000,
      expense: totalExpense,
      categorySpentMap,
    };
  }, [purposeTransactions, incomeSuggestion]);

  function applyActualsAsBudget() {
    const result = applyActualsToBudget(
      allocations,
      actualSummarySuggestion.income,
      actualSummarySuggestion.categorySpentMap,
    );

    setExpectedIncome(result.expectedIncome);
    setAllocations(result.allocations);

    return result;
  }
  const categorySpentActuals = useMemo(
    () => computeCategorySpentActuals(purposeTransactions, month),
    [purposeTransactions, month],
  );

  // Spec A3 — Rollover Budget: unused budget from last month's categories
  // carries forward as extra headroom this month, category by category.
  const previousCategorySpentActuals = useMemo(
    () => computeCategorySpentActuals(purposeTransactions, previousMonth),
    [purposeTransactions, previousMonth],
  );

  const previousAllocations = previousPlanQuery.data?.allocations ?? null;

  const rolloverBreakdowns = useMemo(() => {
    const map: Record<string, RolloverBreakdown> = {};
    for (const allocation of allocations) {
      map[allocation.id] = computeEffectiveBudget(
        allocation,
        previousAllocations,
        previousCategorySpentActuals[allocation.category] ?? 0,
      );
    }
    return map;
  }, [allocations, previousAllocations, previousCategorySpentActuals]);

  function updateAllocation(id: string, plannedAmount: number) {
    setAllocations((current) =>
      current.map((item) =>
        item.id === id ? { ...item, plannedAmount: Math.max(0, plannedAmount) } : item,
      ),
    );
  }

  function toggleRollover(id: string) {
    setAllocations((current) =>
      current.map((item) =>
        item.id === id ? { ...item, rollover: !item.rollover } : item,
      ),
    );
  }

  function removeAllocation(id: string) {
    setAllocations((current) => current.filter((item) => item.id !== id));
  }

  function addCategory(name: string) {
    const color = categoryPalette[allocations.length % categoryPalette.length];
    setAllocations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        category: name,
        plannedAmount: 0,
        color,
      },
    ]);
  }

  function startEditing() {
    setIsEditing(true);
  }

  function cancelEditing() {
    if (savedPlan) {
      setExpectedIncome(savedPlan.expectedIncome);
      setAllocations(savedPlan.allocations);
    }
    setIsEditing(false);
  }

  function applySuggestions() {
    setAllocations((current) => applyPlanSuggestions(current, suggestions));
    setShowIncomeIdeas(false);
  }

  function autoBalance() {
    setAllocations((current) =>
      autoBalanceAllocations(current, expectedIncome),
    );
  }

  function applyBudgetSetup(
    nextIncome: number,
    nextAllocations: PlanAllocation[],
  ) {
    setExpectedIncome(nextIncome);
    setAllocations(nextAllocations);
  }

  async function persistPlan(options?: { title?: string }) {
    setIsSaving(true);
    setError(null);

    try {
      const plan: MonthlyPlan = {
        id: savedPlan?.id ?? month,
        userId: user?.id,
        month,
        title:
          options?.title?.trim() ||
          savedPlan?.title ||
          formatDefaultPlanTitle(month),
        purposeId,
        expectedIncome,
        allocations,
        budgetSetAt: savedPlan?.budgetSetAt ?? new Date().toISOString(),
        isBudgetLocked: true,
        createdAt: savedPlan?.createdAt,
        updatedAt: new Date().toISOString(),
      };

      const saved = await saveMonthlyPlan(user?.id, plan);
      queryClient.setQueryData(
        queryKeys.monthlyPlan(user?.id, month, purposeId),
        saved,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.allMonthlyPlans(user?.id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.allMonthlyPlanActuals(user?.id),
      });
      setIsEditing(false);
      hydratedMonthRef.current = `${month}:${purposeId}`;

      return saved;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save monthly plan.",
      );
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePlan() {
    if (!savedPlan) return;
    await deleteMonthlyPlan(user?.id, savedPlan.id);
    queryClient.setQueryData(
      queryKeys.monthlyPlan(user?.id, month, purposeId),
      null,
    );
    hydratedMonthRef.current = null;
    setIsEditing(false);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.allMonthlyPlans(user?.id),
    });
  }

  return {
    month,
    setMonth,
    purposeId,
    setPurposeId,
    expectedIncome,
    setExpectedIncome,
    allocations,
    activeCategory,
    setActiveCategory,
    showIncomeIdeas,
    setShowIncomeIdeas,
    isLoading,
    isSaving,
    error: error ?? (planQuery.error instanceof Error ? planQuery.error.message : null),
    incomeSuggestion,
    totalPlanned,
    bufferPlanned,
    status,
    delta,
    utilization,
    shortfall,
    suggestions,
    incomeIdeas,
    updateAllocation,
    toggleRollover,
    rolloverBreakdowns,
    removeAllocation,
    addCategory,
    savedPlan,
    hasSavedPlan,
    isActivePlan,
    isBudgetLocked,
    budgetSetAt,
    isEditing,
    isViewMode,
    startEditing,
    cancelEditing,
    applySuggestions,
    persistPlan,
    deletePlan,
    actualSummarySuggestion,
    applyActualsAsBudget,
    autoBalance,
    applyBudgetSetup,
    categorySpentActuals,
    reload: () => {
      hydratedMonthRef.current = null;
      void planQuery.refetch();
    },
  };
}