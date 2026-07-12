"use client";

import { BookOpen, PenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { AIWeeklySummary } from "@/components/journal/AIWeeklySummary";
import { JournalHistory } from "@/components/journal/JournalHistory";
import { ReflectionForm } from "@/components/journal/ReflectionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useReflections } from "@/hooks/useReflections";
import { useWeeklyReflection } from "@/hooks/useWeeklyReflection";
import { useTransactions } from "@/hooks/useTransactions";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { buildMonthlyReflectionSummary } from "@/lib/ai/generateSummary";
import {
  formatWeekLabel,
  getReflectionStatus,
  getStandoutTransactions,
  getWeekOptions,
  getWeekStart,
} from "@/lib/journal";
import { getCurrentPlanMonth } from "@/lib/plan";
import { useToast } from "@/providers/toast-provider";
import type { AIWeeklySummary as Summary } from "@/types";

export function JournalPage() {
  const { notify } = useToast();
  const weekOptions = getWeekOptions();
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart());
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { reflections, isLoading: historyLoading } = useReflections();
  const { transactions } = useTransactions();
  const planQuery = useMonthlyPlanQuery(getCurrentPlanMonth());
  const weeklyReflection = useWeeklyReflection(selectedWeek);

  const standoutTransactions = useMemo(
    () => getStandoutTransactions(transactions, selectedWeek),
    [selectedWeek, transactions],
  );

  const status = getReflectionStatus(
    selectedWeek,
    Boolean(weeklyReflection.reflection),
  );

  const monthlySummary = useMemo(
    () =>
      buildMonthlyReflectionSummary({
        reflections,
        transactions,
        month: getCurrentPlanMonth(),
        monthlyPlan: planQuery.data ?? null,
      }),
    [planQuery.data, reflections, transactions],
  );

  async function generateSummary(values: {
    weekStart: string;
    mood: number;
    wins: string;
    unnecessarySpend: string;
    planAdherence: number;
    planAdherenceNote?: string;
    differentNextWeek: string;
    standoutTransactions?: string;
  }) {
    const response = await fetch("/api/ai/weekly-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reflection: values,
        transactions,
        monthlyPlan: planQuery.data ?? null,
        pastReflections: reflections,
      }),
    });

    if (!response.ok) {
      throw new Error("Summary generation failed");
    }

    return (await response.json()) as Summary;
  }

  async function handleSave(values: {
    mood: number;
    wins: string;
    unnecessarySpend: string;
    planAdherenceNote?: string;
    differentNextWeek: string;
    standoutTransactions?: string;
  }) {
    setIsSaving(true);
    try {
      const payload = {
        weekStart: selectedWeek,
        mood: values.mood,
        wins: values.wins,
        unnecessarySpend: values.unnecessarySpend,
        planAdherence: weeklyReflection.planAdherence,
        planAdherenceNote: values.planAdherenceNote,
        differentNextWeek: values.differentNextWeek,
        standoutTransactions: values.standoutTransactions,
      };

      const nextSummary = await generateSummary(payload);
      await weeklyReflection.persistReflection(payload, nextSummary.narrative);
      setSummary(nextSummary);
      setShowForm(false);
      notify({
        title: "Reflection saved",
        description: "Your AI weekly summary is ready.",
      });
    } catch {
      notify({
        title: "Could not save reflection",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!weeklyReflection.reflection) return;
    setIsRegenerating(true);
    try {
      const nextSummary = await generateSummary({
        weekStart: weeklyReflection.reflection.weekStart,
        mood: weeklyReflection.reflection.mood,
        wins: weeklyReflection.reflection.wins,
        unnecessarySpend: weeklyReflection.reflection.unnecessarySpend,
        planAdherence: weeklyReflection.reflection.planAdherence,
        planAdherenceNote: weeklyReflection.reflection.planAdherenceNote,
        differentNextWeek: weeklyReflection.reflection.differentNextWeek,
        standoutTransactions: weeklyReflection.reflection.standoutTransactions,
      });
      await weeklyReflection.persistReflection(
        weeklyReflection.reflection,
        nextSummary.narrative,
      );
      setSummary(nextSummary);
      notify({ title: "Summary regenerated" });
    } finally {
      setIsRegenerating(false);
    }
  }

  const activeSummary =
    summary ??
    (weeklyReflection.reflection?.aiSummary
      ? {
          narrative: weeklyReflection.reflection.aiSummary,
          patterns: [],
          suggestions: [],
          encouragement: "Keep reflecting each week to strengthen your habits.",
        }
      : null);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
            <BookOpen className="size-6 text-primary" />
            Weekly Reflection Journal
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Reflect on your week, track mood, and turn spending data into personal
            insights.
          </p>
        </div>
        <div className="grid gap-2 sm:w-80">
          <Label htmlFor="journal-week">Week</Label>
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            id="journal-week"
            value={selectedWeek}
            onChange={(event) => {
              setSelectedWeek(event.target.value);
              setShowForm(false);
              setSummary(null);
            }}
          >
            {weekOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">{formatWeekLabel(selectedWeek)}</Badge>
        <Badge
          variant={
            status.startsWith("Completed") ? "default" : "secondary"
          }
        >
          {status}
        </Badge>
        {!weeklyReflection.reflection && !showForm ? (
          <Button onClick={() => setShowForm(true)}>
            <PenLine className="size-4" />
            Write reflection
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-6">
          {weeklyReflection.isLoading ? (
            <Skeleton className="h-96" />
          ) : showForm || !weeklyReflection.reflection ? (
            <Card>
              <CardHeader>
                <CardTitle>Weekly reflection</CardTitle>
              </CardHeader>
              <CardContent>
                <ReflectionForm
                  key={selectedWeek}
                  initialValues={weeklyReflection.reflection}
                  isSubmitting={isSaving}
                  planAdherence={weeklyReflection.planAdherence}
                  standoutTransactions={standoutTransactions}
                  weekStart={selectedWeek}
                  onSubmit={handleSave}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Saved reflection</CardTitle>
                <Button
                  variant="outline"
                  onClick={() => setShowForm(true)}
                >
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <p>
                  <span className="text-muted-foreground">Mood:</span>{" "}
                  {weeklyReflection.reflection.mood}/5
                </p>
                <p>
                  <span className="text-muted-foreground">Win:</span>{" "}
                  {weeklyReflection.reflection.wins}
                </p>
                <p>
                  <span className="text-muted-foreground">Unnecessary spend:</span>{" "}
                  {weeklyReflection.reflection.unnecessarySpend}
                </p>
                <p>
                  <span className="text-muted-foreground">Next week:</span>{" "}
                  {weeklyReflection.reflection.differentNextWeek}
                </p>
              </CardContent>
            </Card>
          )}

          {activeSummary ? (
            <AIWeeklySummary
              isRegenerating={isRegenerating}
              summary={activeSummary}
              onRegenerate={handleRegenerate}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly reflection summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {monthlySummary}
            </CardContent>
          </Card>
        </div>

        <div>
          {historyLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <JournalHistory
              reflections={reflections}
              selectedWeek={selectedWeek}
              onSelect={(weekStart) => {
                setSelectedWeek(weekStart);
                setShowForm(false);
                setSummary(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}