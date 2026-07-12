"use client";

import { CalendarCheck, IndianRupee, Pencil, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddCategoryModal } from "@/components/plan/AddCategoryModal";
import { FitsIncomeBanner } from "@/components/plan/FitsIncomeBanner";
import { PlanAllocationSheet } from "@/components/plan/PlanAllocationSheet";
import { PlanMonthSelector } from "@/components/plan/PlanMonthSelector";
import { PlanOverviewPanel } from "@/components/plan/PlanOverviewPanel";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonthlyPlan } from "@/hooks/useMonthlyPlan";
import { formatPlanMonth, getPieChartData, sumPlanned } from "@/lib/plan";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

export function PlanPage() {
  const { notify } = useToast();
  const plan = useMonthlyPlan();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [saveTargetTemplateId, setSaveTargetTemplateId] = useState<string | null>(
    null,
  );
  const [hasStartedPlanning, setHasStartedPlanning] = useState(false);

  const showWorkspace = plan.hasSavedPlan || hasStartedPlanning;

  useEffect(() => {
    setHasStartedPlanning(false);
  }, [plan.month, plan.purposeId]);

  useEffect(() => {
    if (plan.hasSavedPlan) {
      setHasStartedPlanning(true);
    }
  }, [plan.hasSavedPlan]);

  const totalActual = useMemo(
    () =>
      Object.values(plan.categorySpentActuals).reduce(
        (sum, amount) => sum + amount,
        0,
      ),
    [plan.categorySpentActuals],
  );

  const pieData = useMemo(
    () => getPieChartData(plan.allocations),
    [plan.allocations],
  );

  function openSavePlanDialog() {
    const targetTemplate = plan.templates.find(
      (template) => template.id === saveTargetTemplateId,
    );
    setPlanName(targetTemplate?.name ?? formatPlanMonth(plan.month));
    setSavePlanOpen(true);
  }

  async function handleSavePlan() {
    const name = planName.trim() || formatPlanMonth(plan.month);
    try {
      await plan.persistPlan();
      await plan.persistPlan({
        asTemplate: true,
        templateId: saveTargetTemplateId ?? undefined,
        templateName: name,
      });
      setSavePlanOpen(false);
      setSaveTargetTemplateId(null);
      notify({
        title: plan.hasSavedPlan ? "Plan updated" : "Plan saved",
        description: saveTargetTemplateId
          ? `Saved plan "${name}" updated.`
          : `${name} has been saved and added to your saved plans.`,
      });
    } catch {
      notify({
        title: "Couldn't save plan",
        description: "Something went wrong while saving. Please try again.",
        variant: "destructive",
      });
    }
  }

  function handleApplySavedPlan(template: (typeof plan.templates)[number]) {
    plan.applyTemplate(template);
    plan.startEditing();
    setHasStartedPlanning(true);
    setSaveTargetTemplateId(template.id);
    notify({
      title: "Plan applied",
      description: `${template.name} loaded into ${formatPlanMonth(plan.month)}. Edit and save to keep it.`,
    });
  }

  async function handleDeleteTemplate(template: (typeof plan.templates)[number]) {
    if (!window.confirm(`Delete saved plan "${template.name}"?`)) return;
    try {
      await plan.deleteTemplate(template.id);
      if (saveTargetTemplateId === template.id) setSaveTargetTemplateId(null);
      notify({
        title: "Saved plan deleted",
        description: `${template.name} has been removed.`,
      });
    } catch {
      notify({
        title: "Couldn't delete saved plan",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  }

  function handleStartPlanning() {
    setHasStartedPlanning(true);
    if (plan.expectedIncome <= 0 && plan.incomeSuggestion > 0) {
      plan.setExpectedIncome(plan.incomeSuggestion);
    }
  }

  return (
    <div className="grid gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set spending limits, track progress.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
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
          <Skeleton className="h-20" />
          <Skeleton className="h-28" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      ) : !showWorkspace ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <IndianRupee className="size-5" />
          </div>
          <p className="text-base font-semibold text-foreground">
            No plan for {formatPlanMonth(plan.month)} yet.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Set your expected income and allocate spending across categories.
          </p>
          <Button className="mt-6" onClick={handleStartPlanning}>
            Start planning
          </Button>
        </div>
      ) : (
        <>
          <FitsIncomeBanner
            expectedIncome={plan.expectedIncome}
            totalPlanned={plan.totalPlanned}
          />

          {plan.hasSavedPlan ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {plan.isEditing
                  ? "Editing this month's plan."
                  : `Plan saved for ${formatPlanMonth(plan.month)}.`}
              </p>
              {plan.isEditing ? (
                <Button size="sm" variant="outline" onClick={plan.cancelEditing}>
                  Cancel
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={plan.startEditing}>
                  <Pencil className="mr-2 size-4" />
                  Edit plan
                </Button>
              )}
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card p-6">
            <Label className="text-sm font-medium" htmlFor="expected-income">
              Expected income this month
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Total income you expect to receive in {formatPlanMonth(plan.month)}.
            </p>
            <div className="relative mt-4 max-w-md">
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9 font-mono text-lg"
                disabled={plan.isViewMode}
                id="expected-income"
                inputMode="decimal"
                placeholder="₹ 0"
                value={plan.expectedIncome || ""}
                onChange={(event) =>
                  plan.setExpectedIncome(Number(event.target.value) || 0)
                }
              />
            </div>
            {plan.incomeSuggestion > 0 ? (
              <Button
                className="mt-3"
                disabled={plan.isViewMode}
                type="button"
                variant="outline"
                onClick={() => plan.setExpectedIncome(plan.incomeSuggestion)}
              >
                Use suggested income ({formatCurrency(plan.incomeSuggestion)})
              </Button>
            ) : null}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <PlanAllocationSheet
              allocations={plan.allocations}
              categorySpentActuals={plan.categorySpentActuals}
              disabled={plan.isViewMode}
              rolloverBreakdowns={plan.rolloverBreakdowns}
              totalActual={totalActual}
              totalPlanned={plan.totalPlanned}
              onAddCategory={() => setAddCategoryOpen(true)}
              onAmountChange={plan.updateAllocation}
              onToggleRollover={plan.toggleRollover}
            />
            <PlanOverviewPanel
              activeCategory={plan.activeCategory}
              allocations={plan.allocations}
              categorySpentActuals={plan.categorySpentActuals}
              pieData={pieData}
              utilization={plan.utilization}
              onCategorySelect={plan.setActiveCategory}
            />
          </div>

          {!plan.isViewMode ? (
            <div className="flex justify-end">
              <Button disabled={plan.isSaving} onClick={openSavePlanDialog}>
                <Save className="mr-2 size-4" />
                {saveTargetTemplateId ? "Save changes" : "Save plan"}
              </Button>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card">
            <div className="border-b px-6 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Saved plans
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Plans you&apos;ve saved. Apply one to {formatPlanMonth(plan.month)}
                {" "}or any other month.
              </p>
            </div>
            <div className="p-6">
              {plan.templates.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No saved plans yet. Save this plan to reuse it next month.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {plan.templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex flex-col justify-between rounded-xl border p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <CalendarCheck className="size-4 text-muted-foreground" />
                            {template.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Income {formatCurrency(template.expectedIncome)} · Planned{" "}
                            {formatCurrency(sumPlanned(template.allocations))}
                          </p>
                        </div>
                        <button
                          aria-label={`Delete ${template.name}`}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={plan.isSaving}
                          type="button"
                          onClick={() => handleDeleteTemplate(template)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          className="flex-1"
                          disabled={plan.isSaving}
                          size="sm"
                          variant="outline"
                          onClick={() => handleApplySavedPlan(template)}
                        >
                          Apply to {formatPlanMonth(plan.month)}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <AddCategoryModal
        open={addCategoryOpen}
        onAdd={plan.addCategory}
        onOpenChange={setAddCategoryOpen}
      />

      <Dialog open={savePlanOpen} onOpenChange={setSavePlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save plan</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="plan-name">Plan name</Label>
              <Input
                id="plan-name"
                placeholder="e.g., Jun 2026"
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
              />
            </div>
            {plan.templates.length > 0 ? (
              <div className="grid gap-2">
                <Label htmlFor="save-target">Save as</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  id="save-target"
                  value={saveTargetTemplateId ?? ""}
                  onChange={(event) =>
                    setSaveTargetTemplateId(event.target.value || null)
                  }
                >
                  <option value="">Create new saved plan</option>
                  {plan.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      Update &quot;{template.name}&quot;
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSavePlanOpen(false);
                setSaveTargetTemplateId(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={plan.isSaving || !planName.trim()} onClick={handleSavePlan}>
              {saveTargetTemplateId ? "Save changes" : "Save plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}