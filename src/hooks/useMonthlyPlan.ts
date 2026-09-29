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

function cleanAllocations(raw: PlanAllocation[]): PlanAllocation[] {
  const map = new Map<string, PlanAllocation>();
  for (const item of raw) {
    const isOuting =
      item.category === "cat-exp-outings" ||
      item.category?.toLowerCase() === "outing" ||
      item.category?.toLowerCase() === "outings" ||
      item.id?.toLowerCase().includes("outing");

    const norm = isOuting ? "outings" : (item.category || "").toLowerCase();
    const cleanName = isOuting ? "Outings" : item.category;

    const existing = map.get(norm);
    if (!existing) {
      map.set(norm, {
        ...item,
        category: cleanName,
        color: isOuting ? "#0ea5e9" : item.color,
      });
    } else {
      map.set(norm, {
        ...existing,
        plannedAmount: Math.max(existing.plannedAmount, item.plannedAmount),
      });
    }
  }
  return Array.from(map.values());
}

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
  const [purposeId, setPurposeId] = useState(() => {
    if (initialPurposeId === PERSONAL_PURPOSE_ID && purposes.length > 0) {
      return getDefaultPersonalPurpose(purposes)?.id ?? initialPurposeId;
    }
    return initialPurposeId;
  });
  const [expectedIncome, setExpectedIncome] = useState(0);
  const [allocations, setAllocations] = useState<PlanAllocation[]>([]);
  const allocationsRef = useRef<PlanAllocation[]>(allocations);
  allocationsRef.current = allocations;
  const expectedIncomeRef = useRef(expectedIncome);
  expectedIncomeRef.current = expectedIncome;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showIncomeIdeas, setShowIncomeIdeas] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedMonthRef = useRef<string | null>(null);
  const prevMonthRef = useRef(month);
  const prevPurposeIdRef = useRef(purposeId);
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

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
    const isMonthChange = prevMonthRef.current !== month;
    const isPurposeChange = prevPurposeIdRef.current !== purposeId;

    const defaultPersonal = getDefaultPersonalPurpose(purposes);
    const isInitialPersonalResolution =
      prevPurposeIdRef.current === PERSONAL_PURPOSE_ID &&
      Boolean(defaultPersonal?.id && defaultPersonal.id === purposeId);

    prevMonthRef.current = month;
    prevPurposeIdRef.current = purposeId;

    // Do not reset user input or close editing if this is just the silent initial resolution of personal purpose ID
    if (isInitialPersonalResolution && !isMonthChange) {
      return;
    }

    if (isMonthChange || isPurposeChange) {
      if (isEditingRef.current && hydratedMonthRef.current === `${month}:${purposeId}`) {
        return;
      }
      hydratedMonthRef.current = null;
      setIsEditing(false);
      setExpectedIncome(0);
      setAllocations([]);
      setActiveCategory(null);
    }
  }, [month, purposeId, purposes]);

  useEffect(() => {
    if (purposeId !== PERSONAL_PURPOSE_ID || purposes.length === 0) return;
    const defaultPersonal = getDefaultPersonalPurpose(purposes);
    if (defaultPersonal?.id && defaultPersonal.id !== purposeId) {
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

    const hasOutings = resolvedCategories.some(
      (c) => c.name.toLowerCase() === "outings" || c.name.toLowerCase() === "outing",
    );
    const finalCategories = hasOutings
      ? resolvedCategories
      : [
          ...resolvedCategories,
          {
            id: "cat-exp-11",
            name: "Outings",
            type: "expense" as const,
            color: "#0ea5e9",
            icon: "compass",
            isDefault: true,
          },
        ];

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

    // Do not clobber user's active edits with background refetches
    if (isEditingRef.current && hydratedMonthRef.current) {
      return;
    }

    const plan = planQuery.data;
    if (plan) {
      setExpectedIncome(plan.expectedIncome);
      const cleaned = cleanAllocations(plan.allocations);
      const hasPlanOutings = cleaned.some(
        (a) => a.category.toLowerCase() === "outings" || a.category.toLowerCase() === "outing",
      );
      if (!hasPlanOutings) {
        setAllocations([
          ...cleaned,
          {
            id: crypto.randomUUID(),
            category: "Outings",
            plannedAmount: 0,
            color: "#0ea5e9",
          },
        ]);
      } else {
        setAllocations(cleaned);
      }
      hydratedMonthRef.current = hydrationKey;
      return;
    }

    const empty = createEmptyPlan(month, finalCategories);
    const cleanedEmpty = cleanAllocations(empty.allocations);
    setExpectedIncome(incomeSuggestion);
    setAllocations((current) =>
      hydratedMonthRef.current === hydrationKey
        ? mergeAllocations(current, cleanedEmpty)
        : cleanedEmpty,
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

  function updateAllocation(id: string, plannedAmount: number, categoryName?: string): PlanAllocation[] {
    let targetName =
      categoryName ||
      (id.startsWith("unbudgeted-") ? id.replace("unbudgeted-", "") : null);

    const isOuting =
      id === "cat-exp-outings" ||
      targetName === "cat-exp-outings" ||
      id.toLowerCase().includes("outing") ||
      (targetName && targetName.toLowerCase().includes("outing"));

    const current = allocationsRef.current;
    let next: PlanAllocation[];

    if (isOuting) {
      targetName = "Outings";
      // Remove ANY other duplicate Outings allocations
      const nonOutings = current.filter(
        (item) =>
          item.category !== "cat-exp-outings" &&
          item.category.toLowerCase() !== "outing" &&
          item.category.toLowerCase() !== "outings" &&
          !item.id.toLowerCase().includes("outing"),
      );
      const existingOuting = current.find(
        (item) =>
          item.id === id ||
          item.category === "cat-exp-outings" ||
          item.category.toLowerCase() === "outing" ||
          item.category.toLowerCase() === "outings" ||
          item.id.toLowerCase().includes("outing"),
      );

      next = [
        ...nonOutings,
        {
          id: existingOuting ? existingOuting.id : "cat-exp-11",
          category: "Outings",
          plannedAmount: Math.max(0, plannedAmount),
          color: "#0ea5e9",
        },
      ];
    } else {
      const existingIndex = current.findIndex(
        (item) =>
          item.id === id ||
          (targetName && item.category.toLowerCase() === targetName.toLowerCase()) ||
          item.category.toLowerCase() === id.toLowerCase(),
      );

      if (existingIndex !== -1) {
        next = current.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                category: targetName || item.category,
                plannedAmount: Math.max(0, plannedAmount),
              }
            : item,
        );
      } else {
        const finalName = targetName || id;
        const color = categoryPalette[current.length % categoryPalette.length];
        next = [
          ...current,
          {
            id: crypto.randomUUID(),
            category: finalName,
            plannedAmount: Math.max(0, plannedAmount),
            color,
          },
        ];
      }
    }

    allocationsRef.current = next;
    setAllocations(next);
    return next;
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

  function addCategory(name: string, customColor?: string, customIcon?: string) {
    const color = customColor || categoryPalette[allocations.length % categoryPalette.length];
    setAllocations((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        category: name,
        plannedAmount: 0,
        color,
        icon: customIcon,
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

  function loadAndEditPlan(targetPlan: MonthlyPlan) {
    const targetPurposeId = targetPlan.purposeId || PERSONAL_PURPOSE_ID;
    hydratedMonthRef.current = `${targetPlan.month}:${targetPurposeId}`;
    prevMonthRef.current = targetPlan.month;
    prevPurposeIdRef.current = targetPurposeId;

    setMonth(targetPlan.month);
    setPurposeId(targetPurposeId);
    setExpectedIncome(targetPlan.expectedIncome);
    expectedIncomeRef.current = targetPlan.expectedIncome;

    const cleaned = cleanAllocations(targetPlan.allocations);
    setAllocations(cleaned);
    allocationsRef.current = cleaned;

    setIsEditing(true);
  }

  function adoptPlanAsTemplate(sourcePlan: MonthlyPlan) {
    setExpectedIncome(sourcePlan.expectedIncome);
    expectedIncomeRef.current = sourcePlan.expectedIncome;

    const cleaned = cleanAllocations(sourcePlan.allocations);
    setAllocations(cleaned);
    allocationsRef.current = cleaned;

    setIsEditing(true);
  }

  async function persistPlan(options?: {
    title?: string;
    allocations?: PlanAllocation[];
    expectedIncome?: number;
  }) {
    setIsSaving(true);
    setError(null);

    try {
      const planAllocations = options?.allocations ?? allocationsRef.current;
      const planExpectedIncome = options?.expectedIncome ?? expectedIncomeRef.current;

      const plan: MonthlyPlan = {
        id: savedPlan?.id ?? month,
        userId: user?.id,
        month,
        title:
          options?.title?.trim() ||
          savedPlan?.title ||
          formatDefaultPlanTitle(month),
        purposeId,
        expectedIncome: planExpectedIncome,
        allocations: planAllocations,
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
      setAllocations(saved.allocations);
      setExpectedIncome(saved.expectedIncome);
      allocationsRef.current = saved.allocations;
      expectedIncomeRef.current = saved.expectedIncome;
      setIsEditing(false);
      hydratedMonthRef.current = `${month}:${purposeId}`;

      void queryClient.invalidateQueries({
        queryKey: queryKeys.allMonthlyPlans(user?.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.allMonthlyPlanActuals(user?.id),
      });

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

  const previousSavedPlan = previousPlanQuery.data ?? null;
  const hasPreviousSavedPlan = Boolean(previousSavedPlan);

  function copyFromPreviousPlan() {
    if (!previousSavedPlan) return false;
    setExpectedIncome(previousSavedPlan.expectedIncome);
    setAllocations(
      previousSavedPlan.allocations.map((a) => ({
        ...a,
        id: a.id,
        plannedAmount: a.plannedAmount,
      })),
    );
    return true;
  }

  return {
    month,
    setMonth,
    purposeId,
    setPurposeId,
    previousMonth,
    previousSavedPlan,
    hasPreviousSavedPlan,
    copyFromPreviousPlan,
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
    loadAndEditPlan,
    adoptPlanAsTemplate,
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