"use client";

import {
  Copy,
  CreditCard,
  IndianRupee,
  Pencil,
  PiggyBank,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddCategoryModal } from "@/components/plan/AddCategoryModal";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { FitsIncomeBanner } from "@/components/plan/FitsIncomeBanner";
import { PlanAllocationSheet } from "@/components/plan/PlanAllocationSheet";
import { PlanCategoryCardGrid } from "@/components/plan/PlanCategoryCardGrid";
import { PlanMonthSelector } from "@/components/plan/PlanMonthSelector";
import { PlanOverviewPanel } from "@/components/plan/PlanOverviewPanel";
import { SavedPlansList } from "@/components/plan/SavedPlansList";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailySafeSpending } from "@/hooks/useDailySafeSpending";
import { useMonthlyPlan } from "@/hooks/useMonthlyPlan";
import {
  useAllMonthlyPlanActualsQuery,
  useAllMonthlyPlansQuery,
} from "@/hooks/useMonthlyPlanQuery";
import { useOutings } from "@/hooks/useOutings";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  formatPlanMonth,
  getPieChartData,
} from "@/lib/plan";
import type { MonthlyPlanActuals } from "@/lib/supabase-data";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { MonthlyPlan, PlanAllocation } from "@/types";

export function PlanPage() {
  const { notify } = useToast();
  const plan = useMonthlyPlan();
  const { purposes } = usePurposes();
  const { transactions } = useTransactions();
  const { outings } = useOutings();
  const dailySafeSpending = useDailySafeSpending();
  const allPlansQuery = useAllMonthlyPlansQuery();
  const allActualsQuery = useAllMonthlyPlanActualsQuery();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const sheetOpen = isCreating || plan.isEditing;

  const pieData = useMemo(
    () => getPieChartData(plan.allocations),
    [plan.allocations],
  );

  const actualsByPlanId = useMemo(() => {
    const map: Record<string, MonthlyPlanActuals> = {};
    for (const row of allActualsQuery.data ?? []) {
      map[row.planId] = row;
    }
    return map;
  }, [allActualsQuery.data]);

  function openSetupSheet() {
    setIsCreating(true);
    if (plan.expectedIncome <= 0 && plan.incomeSuggestion > 0) {
      plan.setExpectedIncome(plan.incomeSuggestion);
    }
  }

  function handleCancelSheet() {
    if (plan.isEditing) {
      plan.cancelEditing();
    }
    setIsCreating(false);
  }

  async function handleSetAndSavePlan() {
    try {
      await plan.persistPlan();
      setIsCreating(false);
      plan.cancelEditing();
      notify({
        title: plan.hasSavedPlan ? "Plan updated" : "Plan saved",
        description: `Your plan for ${formatPlanMonth(plan.month)} has been saved.`,
      });
    } catch {
      notify({
        title: "Couldn't save plan",
        description: "Something went wrong while saving. Please try again.",
        variant: "destructive",
      });
    }
  }

  function handleAutoFillPlan() {
    if (plan.incomeSuggestion > 0 && plan.expectedIncome === 0) {
      plan.setExpectedIncome(plan.incomeSuggestion);
    }
    plan.autoBalance();
    notify({
      title: "Plan Auto-Balanced",
      description: "Category allocations updated based on 3-month spending averages.",
    });
  }

  async function handleQuickAdjust(id: string, delta: number) {
    const isOutingCat = (name: string) =>
      name.toLowerCase() === "outings" ||
      name.toLowerCase() === "outing" ||
      name.toLowerCase() === "cat-exp-outings" ||
      name.toLowerCase().includes("outing");

    let current = plan.allocations.find((a) => a.id === id);
    if (!current && id.startsWith("unbudgeted-")) {
      const categoryName = id.replace("unbudgeted-", "");
      current = plan.allocations.find((a) =>
        isOutingCat(categoryName)
          ? isOutingCat(a.category)
          : a.category.toLowerCase() === categoryName.toLowerCase(),
      );
    }
    if (!current && isOutingCat(id)) {
      current = plan.allocations.find((a) => isOutingCat(a.category));
    }

    const currentPlanned = current?.plannedAmount ?? 0;
    const newAmount = Math.max(0, currentPlanned + delta);

    let updatedAllocations: PlanAllocation[] | undefined;
    if (current) {
      updatedAllocations = plan.updateAllocation(current.id, newAmount);
    } else {
      const categoryName = id.startsWith("unbudgeted-")
        ? id.replace("unbudgeted-", "")
        : isOutingCat(id)
        ? "Outings"
        : id;
      updatedAllocations = plan.updateAllocation(id, newAmount, isOutingCat(categoryName) ? "Outings" : categoryName);
    }

    try {
      await plan.persistPlan({ allocations: updatedAllocations });
      notify({
        title: "Category limit updated",
        description: `Target limit set to ${formatCurrency(newAmount)}.`,
      });
    } catch {
      notify({
        title: "Couldn't update limit",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  function handleSelectSavedPlan(savedPlan: MonthlyPlan) {
    plan.loadAndEditPlan(savedPlan);
  }

  function handleCopyPlanToCurrent(sourcePlan: MonthlyPlan) {
    plan.adoptPlanAsTemplate(sourcePlan);
    notify({
      title: "Plan Copied to " + formatPlanMonth(plan.month),
      description: `Imported budget limits from ${formatPlanMonth(sourcePlan.month)}. Review and save your plan.`,
    });
  }

  async function handleDeletePlan() {
    setDeleteConfirmOpen(false);
    try {
      await plan.deletePlan();
      notify({
        title: "Plan deleted successfully.",
        description: `Your plan for ${formatPlanMonth(plan.month)} has been removed.`,
      });
    } catch {
      notify({
        title: "Couldn't delete plan",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  }

  const totalSpentSoFar = useMemo(() => {
    return Object.values(plan.categorySpentActuals).reduce((a, b) => a + b, 0);
  }, [plan.categorySpentActuals]);

  const projectedMonthSpend = useMemo(() => {
    if (!plan.month) return totalSpentSoFar;
    const [y, m] = plan.month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
    const day = isCurrent ? Math.max(1, today.getDate()) : daysInMonth;
    return Math.round((totalSpentSoFar / day) * daysInMonth);
  }, [plan.month, totalSpentSoFar]);

  const totalRemainingBudget = Math.max(0, plan.totalPlanned - totalSpentSoFar);
  const spentPercentage = plan.totalPlanned > 0 ? Math.min(100, Math.round((totalSpentSoFar / plan.totalPlanned) * 100)) : 0;
  const remainingPercentage = Math.max(0, 100 - spentPercentage);
  const unallocatedBuffer = Math.max(0, plan.expectedIncome - plan.totalPlanned);

  return (
    <div className="grid gap-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Budget spending targets, daily safe allowance, and category progress.
          </p>
        </div>

        {plan.hasSavedPlan ? (
          <div className="flex flex-wrap items-center gap-2">
            {plan.isActivePlan ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Active Plan
              </span>
            ) : null}
            <Button onClick={plan.startEditing} className="gap-1.5 font-medium">
              <Pencil className="size-4" />
              Edit Plan
            </Button>
            <Button
              disabled={plan.isSaving}
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 font-medium border-destructive/20"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              {plan.isActivePlan ? "Delete Active Plan" : "Delete Plan"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="sx-surface flex flex-wrap items-center gap-3 p-4">
        <PlanMonthSelector month={plan.month} onChange={plan.setMonth} />
        <PurposeFilterChips
          showAllOption={false}
          value={plan.purposeId}
          onChange={plan.setPurposeId}
        />
      </div>

      {plan.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {plan.error}
        </div>
      ) : null}

      {plan.isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-24" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      ) : !plan.hasSavedPlan ? (
        <div className="sx-surface flex flex-col items-center border-dashed px-6 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <IndianRupee className="size-5" />
          </div>
          <p className="text-base font-semibold text-foreground">
            No plan for {formatPlanMonth(plan.month)} yet.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Set your expected income and allocate spending across categories.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {plan.hasPreviousSavedPlan ? (
              <Button
                className="gap-2"
                onClick={() => {
                  plan.copyFromPreviousPlan();
                  setIsCreating(true);
                  notify({
                    title: "Copied from " + formatPlanMonth(plan.previousMonth),
                    description: "Previous limits applied. Review and save your plan.",
                  });
                }}
              >
                <Copy className="size-4" />
                Copy {formatPlanMonth(plan.previousMonth)} Plan
              </Button>
            ) : null}
            <Button
              variant={plan.hasPreviousSavedPlan ? "outline" : "default"}
              onClick={openSetupSheet}
            >
              Setup Custom Plan
            </Button>
            <Button variant="outline" onClick={handleAutoFillPlan}>
              <Sparkles className="mr-1.5 size-4 text-primary" />
              Auto-Fill from History
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Top Row Hero Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {/* 1. Expected Income */}
            <div className="sx-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Expected Income</span>
                <Wallet className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(plan.expectedIncome)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Allocated: {formatCurrency(plan.totalPlanned)}</span>
                <Badge variant="outline" className="text-[10px] font-medium">
                  {plan.expectedIncome > 0
                    ? `${Math.round((plan.totalPlanned / plan.expectedIncome) * 100)}% Set`
                    : "No Income"}
                </Badge>
              </div>
            </div>

            {/* 2. Total Budgeted */}
            <div className="sx-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total Budgeted</span>
                <IndianRupee className="size-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(plan.totalPlanned)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Buffer: {formatCurrency(unallocatedBuffer)}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  {plan.allocations.filter((a) => a.plannedAmount > 0).length} categories
                </span>
              </div>
            </div>

            {/* 3. Total Spent Amount Card */}
            <div className="sx-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total Spent</span>
                <CreditCard className="size-4 text-rose-500" />
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(totalSpentSoFar)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Actual Spent</span>
                <Badge
                  variant={spentPercentage >= 100 ? "destructive" : spentPercentage >= 80 ? "outline" : "secondary"}
                  className="text-[10px] font-semibold"
                >
                  {spentPercentage}% Spent
                </Badge>
              </div>
            </div>

            {/* 4. Total Remaining Amount Card */}
            <div className="sx-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Remaining Budget</span>
                <PiggyBank className="size-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(totalRemainingBudget)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Available Limit</span>
                <Badge variant="success" className="text-[10px] font-semibold">
                  {remainingPercentage}% Left
                </Badge>
              </div>
            </div>

            {/* 5. Daily Safe Allowance Card */}
            <div className="sx-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Daily Safe Allowance</span>
                <TrendingUp className="size-4 text-sky-500" />
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(dailySafeSpending.dailySafeLimit)}
                <span className="text-xs font-normal text-muted-foreground"> / day</span>
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{dailySafeSpending.daysLeft} days left</span>
                <Badge
                  variant={dailySafeSpending.status === "overspent" ? "destructive" : "success"}
                  className="text-[10px] font-semibold"
                >
                  {dailySafeSpending.status === "overspent" ? "Pacing Exceeded" : "On Track"}
                </Badge>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                <span>Month-end pace:</span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    projectedMonthSpend > plan.totalPlanned
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatCurrency(projectedMonthSpend)}
                </span>
              </div>
            </div>
          </div>

          <FitsIncomeBanner
            expectedIncome={plan.expectedIncome}
            totalPlanned={plan.totalPlanned}
          />



          {/* 2-Column Split Desktop Layout */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <PlanOverviewPanel
                activeCategory={plan.activeCategory}
                allocations={plan.allocations}
                categorySpentActuals={plan.categorySpentActuals}
                pieData={pieData}
                utilization={plan.utilization}
                onCategorySelect={plan.setActiveCategory}
                transactions={transactions}
                totalPlanned={plan.totalPlanned}
                month={plan.month}
              />
            </div>

            <div className="lg:col-span-7">
              <PlanCategoryCardGrid
                allocations={plan.allocations}
                categorySpentActuals={plan.categorySpentActuals}
                transactions={transactions}
                outings={outings}
                onQuickAdjust={handleQuickAdjust}
                onEditClick={plan.startEditing}
              />
            </div>
          </div>
        </>
      )}

      <SavedPlansList
        actualsByPlanId={actualsByPlanId}
        currentMonth={plan.month}
        currentPurposeId={plan.purposeId}
        plans={allPlansQuery.data ?? []}
        purposes={purposes}
        onSelect={handleSelectSavedPlan}
        onCopyPlan={handleCopyPlanToCurrent}
      />

      <AddCategoryModal
        open={addCategoryOpen}
        onAdd={plan.addCategory}
        onOpenChange={setAddCategoryOpen}
      />

      <PlanAllocationSheet
        open={sheetOpen}
        month={plan.month}
        expectedIncome={plan.expectedIncome}
        onExpectedIncomeChange={plan.setExpectedIncome}
        incomeSuggestion={plan.incomeSuggestion}
        allocations={plan.allocations}
        categorySpentActuals={plan.categorySpentActuals}
        rolloverBreakdowns={plan.rolloverBreakdowns}
        isSaving={plan.isSaving}
        onAmountChange={plan.updateAllocation}
        onToggleRollover={plan.toggleRollover}
        onAddCategory={() => setAddCategoryOpen(true)}
        onSave={handleSetAndSavePlan}
        onCancel={handleCancelSheet}
        hasPreviousSavedPlan={plan.hasPreviousSavedPlan}
        previousMonthLabel={formatPlanMonth(plan.previousMonth)}
        onCopyFromPreviousPlan={() => {
          plan.copyFromPreviousPlan();
          notify({
            title: "Copied from " + formatPlanMonth(plan.previousMonth),
            description: "Previous limits applied to form.",
          });
        }}
      />
      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        itemLabel="Plan"
        detail={formatPlanMonth(plan.month)}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={() => void handleDeletePlan()}
      />
    </div>
  );
}
