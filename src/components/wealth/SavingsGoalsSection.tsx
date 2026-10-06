"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  Coins,
  Edit2,
  MoreVertical,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { formatCurrency, cn } from "@/lib/utils";
import { NewSavingsGoalModal } from "@/components/wealth/NewSavingsGoalModal";
import { QuickDepositModal } from "@/components/wealth/QuickDepositModal";
import { useToast } from "@/providers/toast-provider";
import type { SavingsGoal } from "@/types";

const COLOR_MAP: Record<string, { bar: string; badge: string; bg: string }> = {
  indigo: {
    bar: "bg-indigo-500",
    badge: "text-indigo-600 bg-indigo-500/10 dark:text-indigo-400 dark:bg-indigo-500/20",
    bg: "bg-indigo-500/10",
  },
  emerald: {
    bar: "bg-emerald-500",
    badge: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/20",
    bg: "bg-emerald-500/10",
  },
  amber: {
    bar: "bg-amber-500",
    badge: "text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-500/20",
    bg: "bg-amber-500/10",
  },
  rose: {
    bar: "bg-rose-500",
    badge: "text-rose-600 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/20",
    bg: "bg-rose-500/10",
  },
  sky: {
    bar: "bg-sky-500",
    badge: "text-sky-600 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-500/20",
    bg: "bg-sky-500/10",
  },
  violet: {
    bar: "bg-violet-500",
    badge: "text-violet-600 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-500/20",
    bg: "bg-violet-500/10",
  },
};

type SavingsGoalsSectionProps = {
  onNewGoalClick?: () => void;
};

export function SavingsGoalsSection({ onNewGoalClick }: SavingsGoalsSectionProps) {
  const { goals, isLoading, removeGoal } = useSavingsGoals();
  const { notify } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [depositGoal, setDepositGoal] = useState<SavingsGoal | null>(null);

  // Active goals only
  const activeGoals = useMemo(
    () => goals.filter((g) => g.isActive !== false && !g.deletedAt),
    [goals],
  );

  const totalTarget = useMemo(
    () => activeGoals.reduce((sum, g) => sum + (g.targetAmount || 0), 0),
    [activeGoals],
  );

  const totalSaved = useMemo(
    () => activeGoals.reduce((sum, g) => sum + (g.savedAmount || 0), 0),
    [activeGoals],
  );

  const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  async function handleDelete(goal: SavingsGoal) {
    if (!confirm(`Delete savings goal "${goal.name}"?`)) return;
    try {
      await removeGoal(goal.id);
      notify({
        title: "Goal removed",
        description: `"${goal.name}" has been deleted.`,
      });
    } catch {
      notify({
        title: "Could not delete",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  function formatDeadline(dateStr?: string) {
    if (!dateStr) return "Any time · Flexible";
    try {
      const d = new Date(dateStr);
      return `Target: ${d.toLocaleString("default", { month: "short", year: "numeric" })}`;
    } catch {
      return `Target: ${dateStr}`;
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Unallocated Savings Pool Banner (Parity with Mobile reference) */}
      <div className="sx-surface rounded-2xl p-4 sm:p-5 border bg-card/60 backdrop-blur relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <PiggyBank className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                SAVINGS POOL & GOALS
              </span>
              <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                ● Active
              </span>
            </div>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {formatCurrency(totalSaved)}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                saved across {activeGoals.length} goals
              </span>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              ⓘ Money allocated towards targets. Add anytime to keep your wealth goals on track.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-center">
            <Button
              onClick={() => {
                setEditingGoal(null);
                setModalOpen(true);
              }}
              size="sm"
              className="gap-1.5 font-medium rounded-xl"
            >
              <Plus className="size-4" />
              New Goal
            </Button>
          </div>
        </div>

        {/* Aggregate Progress Bar */}
        {totalTarget > 0 ? (
          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-muted-foreground">Overall Goal Progress</span>
              <span className="font-semibold text-foreground">
                {overallProgress}% ({formatCurrency(totalSaved)} of {formatCurrency(totalTarget)})
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 2. Goals List Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <span>Savings Goals</span>
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
              {activeGoals.length}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Track dedicated funds for specific milestones and aspirations.
          </p>
        </div>
      </div>

      {/* 3. Goals Cards Grid */}
      {activeGoals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 px-4 text-center bg-card/40">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
            🎯
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            No savings goals yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Create goals for a new bike, vacation, tech gadget, or emergency reserve.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setEditingGoal(null);
              setModalOpen(true);
            }}
            className="mt-4 text-xs gap-1.5 rounded-xl"
          >
            <Plus className="size-3.5" />
            Create First Goal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {activeGoals.map((goal) => {
            const saved = goal.savedAmount || 0;
            const target = goal.targetAmount || 1;
            const pct = Math.min(100, Math.round((saved / target) * 100));
            const remaining = Math.max(0, target - saved);
            const colorTheme = COLOR_MAP[goal.color || "indigo"] || COLOR_MAP.indigo;

            return (
              <div
                key={goal.id}
                className="sx-surface rounded-2xl p-4 sm:p-5 border bg-card flex flex-col justify-between hover:shadow-fintech-hover transition-all duration-200 group"
              >
                {/* Header: Icon, Name, Target Date & Actions */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "flex size-11 items-center justify-center rounded-xl text-2xl shrink-0 transition-transform group-hover:scale-105",
                          colorTheme.bg,
                        )}
                      >
                        {goal.icon || "🎯"}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm sm:text-base text-foreground truncate">
                          {goal.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          <Calendar className="size-3 shrink-0" />
                          <span className="truncate">{formatDeadline(goal.targetDate)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGoal(goal);
                          setModalOpen(true);
                        }}
                        title="Edit goal"
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(goal)}
                        title="Delete goal"
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Amounts & Percentage Pill */}
                  <div className="mt-4 flex items-baseline justify-between">
                    <div>
                      <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {formatCurrency(saved)}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal ml-1">
                        / {formatCurrency(target)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        colorTheme.badge,
                      )}
                    >
                      {pct}% saved
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", colorTheme.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Remaining / Status */}
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {remaining > 0 ? (
                        <>{formatCurrency(remaining)} remaining</>
                      ) : (
                        <span className="text-emerald-500 font-medium flex items-center gap-1">
                          <CheckCircle2 className="size-3.5" /> Target Achieved!
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Footer Action: + Quick Deposit */}
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Instant allocation
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDepositGoal(goal)}
                    className="h-8 text-xs gap-1.5 font-medium rounded-xl hover:bg-primary/5 hover:border-primary/40"
                  >
                    <Coins className="size-3.5 text-primary" />
                    + Quick Deposit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Goal Modal (Create / Edit) */}
      <NewSavingsGoalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialGoal={editingGoal}
      />

      {/* Quick Deposit Modal */}
      <QuickDepositModal
        open={Boolean(depositGoal)}
        onOpenChange={(open) => !open && setDepositGoal(null)}
        goal={depositGoal}
      />
    </div>
  );
}
