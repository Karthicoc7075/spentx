"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aiInsightDocId } from "@/lib/ai/financial-insights";
import { fetchAiInsight, saveAiInsight } from "@/lib/firebase";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { AiInsight, FinancialInsightContext } from "@/types";

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

function isInsightStale(generatedAt: string | undefined) {
  if (!generatedAt) return true;
  return Date.now() - new Date(generatedAt).getTime() >= DAILY_REFRESH_MS;
}

export function useAiFinancialInsights(
  month: string,
  context: FinancialInsightContext | null,
  options?: { enabled?: boolean; autoGenerate?: boolean },
) {
  const { user, isConfigured, isReady } = useAuthReady();
  const enabled = options?.enabled ?? true;
  const autoGenerate = options?.autoGenerate ?? true;

  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoHandledRef = useRef(false);

  const loadInsight = useCallback(async () => {
    if (!user?.id || !enabled) {
      setInsight(null);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const stored = await fetchAiInsight(user.id, month);
      setInsight(stored);
      return stored;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load AI insights.",
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, month, user?.id]);

  const regenerate = useCallback(async () => {
    if (!user?.id || !context || !enabled) return null;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/financial-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });

      const json = (await response.json()) as {
        insight?: {
          summary: string;
          tips: string[];
          healthScore: number;
        };
        error?: string;
      };

      if (!response.ok || !json.insight) {
        throw new Error(json.error ?? "Failed to generate AI insights.");
      }

      const saved = await saveAiInsight(user.id, {
        id: aiInsightDocId(user.id, month),
        month,
        type: "financial_health",
        healthScore: json.insight.healthScore,
        summary: json.insight.summary,
        tips: json.insight.tips,
        generatedAt: new Date().toISOString(),
      });

      setInsight(saved);
      return saved;
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to generate AI insights.",
      );
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [context, enabled, month, user?.id]);

  useEffect(() => {
    autoHandledRef.current = false;
  }, [month, user?.id]);

  useEffect(() => {
    if (isConfigured && !isReady) return;
    void loadInsight();
  }, [isConfigured, isReady, loadInsight]);

  useEffect(() => {
    if (
      !autoGenerate ||
      !enabled ||
      !user?.id ||
      !context ||
      context.totalIncome + context.totalExpense === 0 ||
      isLoading ||
      isGenerating ||
      autoHandledRef.current
    ) {
      return;
    }

    const needsGeneration = !insight;
    const needsDailyRefresh = insight ? isInsightStale(insight.generatedAt) : false;
    const needsScoreRecalibration =
      insight && context
        ? Math.abs(insight.healthScore - context.baseHealthScore) > 20
        : false;

    if (!needsGeneration && !needsDailyRefresh && !needsScoreRecalibration) {
      return;
    }

    autoHandledRef.current = true;
    void regenerate();
  }, [
    autoGenerate,
    context,
    enabled,
    insight,
    isGenerating,
    isLoading,
    regenerate,
    user?.id,
  ]);

  return {
    insight,
    isLoading,
    isGenerating,
    error,
    regenerate,
    reload: loadInsight,
    isPersisted: Boolean(user?.id && isConfigured),
  };
}