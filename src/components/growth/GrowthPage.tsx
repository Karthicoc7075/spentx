"use client";

import { TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { PersonalizedSuggestion } from "@/components/shared/PersonalizedSuggestion";
import { IncomeStreamTable } from "@/components/growth/IncomeStreamTable";
import { IncomeTargetCard } from "@/components/growth/IncomeTargetCard";
import { IncomeTrendChart } from "@/components/growth/IncomeTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIncomeStreams } from "@/hooks/useIncomeStreams";
import { useIncomeTargets } from "@/hooks/useIncomeTargets";
import { useTransactions } from "@/hooks/useTransactions";
import { buildGrowthSuggestions } from "@/lib/ai/growthSuggestions";
import {
  detectIncomeStreamsFromTransactions,
  getActiveTarget,
  getCurrentMonthlyIncome,
  getMonthlyIncomeTrend,
} from "@/lib/growth";

export function GrowthPage() {
  const { transactions } = useTransactions();
  const {
    streams,
    isLoading: streamsLoading,
    addStream,
    updateStream,
    removeStream,
  } = useIncomeStreams();
  const { targets, isLoading: targetsLoading, updateTargets } = useIncomeTargets();

  const currentIncome = useMemo(
    () => getCurrentMonthlyIncome(transactions),
    [transactions],
  );
  const trend = useMemo(
    () => getMonthlyIncomeTrend(transactions, 12),
    [transactions],
  );
  const activeTarget = getActiveTarget(targets);
  const suggestions = useMemo(
    () =>
      buildGrowthSuggestions({
        transactions,
        streams,
        currentIncome,
        targetIncome: activeTarget,
      }),
    [activeTarget, currentIncome, streams, transactions],
  );

  const seededRef = useRef(false);

  useEffect(() => {
    if (streamsLoading || streams.length > 0 || seededRef.current) return;
    const detected = detectIncomeStreamsFromTransactions(transactions);
    if (detected.length === 0) return;
    seededRef.current = true;

    void Promise.all(
      detected.slice(0, 5).map((stream) => addStream(stream)),
    );
  }, [addStream, streams.length, streamsLoading, transactions]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
          <TrendingUp className="size-6 text-primary" />
          Income Growth Planner
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Track income sources, set growth targets, and connect spending patterns
          to earning opportunities.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {targetsLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <IncomeTargetCard
            currentIncome={currentIncome}
            targets={targets}
            onSave={updateTargets}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income trend</CardTitle>
          </CardHeader>
          <CardContent>
            <IncomeTrendChart data={trend} target={activeTarget} />
          </CardContent>
        </Card>
      </div>

      {streamsLoading ? (
        <Skeleton className="h-80" />
      ) : (
        <IncomeStreamTable
          streams={streams}
          onAdd={addStream}
          onDelete={removeStream}
          onUpdate={updateStream}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Growth suggestions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {suggestions.map((suggestion) => (
            <PersonalizedSuggestion key={suggestion.id} suggestion={suggestion} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}