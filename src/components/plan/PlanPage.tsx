"use client";

import { CreditCard, IndianRupee, Pencil, PiggyBank, Sparkles, Trash2, TrendingUp, Wallet } from "lucide-react";
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
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import {
  formatPlanMonth,
  getPieChartData,
  getPlanDisplayTitle,
} from "@/lib/plan";
import type { MonthlyPlanActuals } from "@/lib/supabase-data";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { MonthlyPlan } from "@/types";

export function PlanPage() {
  const { notify } = useToast();
  const plan = useMonthlyPlan();
  const { purposes } = usePurposes();
  const { transactions } = useTransactions();
  const dailySafeSpending = useDailySafeSpending();
  const allPlansQuery = useAllMonthlyPlansQuery();
  const allActualsQuery = useAllMonthlyPlanActualsQuery();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const sheetOpen = isCreating || plan.isEditing;

  useEffect(() => {
    setIsCreating(false);
  }, [plan.month, plan.purposeId]);

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
    } else {
      setIsCreating(false);
    }
  }

  async function handleSetAndSavePlan() {
    try {
      await plan.persistPlan();
      setIsCreating(false);
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
    const current = plan.allocations.find((a) => a.id === id);
    if (!current) return;
    const newAmount = Math.max(0, current.plannedAmount + delta);
    plan.updateAllocation(id, newAmount);
    try {
      await plan.persistPlan();
      notify({
        title: "Category limit updated",
        description: `${current.category} target limit set to ${formatCurrency(newAmount)}.`,
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
    if (savedPlan.month !== plan.month) plan.setMonth(savedPlan.month);
    if ((savedPlan.purposeId ?? "") !== plan.purposeId) {
      plan.setPurposeId(savedPlan.purposeId ?? "");
    }
    plan.startEditing();
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
            <Button size="sm" variant="outline" onClick={handleAutoFillPlan}>
              <Sparkles className="mr-1.5 size-3.5 text-primary" />
              AI Auto-Fill
            </Button>
            <Button size="sm" onClick={plan.startEditing}>
              <Pencil className="mr-1.5 size-3.5" />
              Edit Plan
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
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={openSetupSheet}>
              Setup Plan
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
                <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
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
                  variant={dailySafeSpending.status === "overspent" ? "destructive" : "secondary"}
                  className="text-[10px] font-semibold"
                >
                  {dailySafeSpending.status === "overspent" ? "Pacing Exceeded" : "🟢 On Track"}
                </Badge>
              </div>
            </div>
          </div>

          <FitsIncomeBanner
            expectedIncome={plan.expectedIncome}
            totalPlanned={plan.totalPlanned}
          />

          <div className="sx-surface flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {plan.savedPlan
                ? getPlanDisplayTitle(plan.savedPlan)
                : `Plan saved for ${formatPlanMonth(plan.month)}`}
              .
              {plan.isActivePlan ? <Badge>Active plan</Badge> : null}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={plan.startEditing}>
                <Pencil className="mr-2 size-4" />
                Edit plan
              </Button>
              <Button
                disabled={plan.isSaving}
                size="sm"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                {plan.isActivePlan ? "Delete active plan" : "Delete plan"}
              </Button>
            </div>
          </div>

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
