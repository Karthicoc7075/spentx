"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AIWeeklySummary as Summary } from "@/types";

type AIWeeklySummaryProps = {
  summary: Summary;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
};

export function AIWeeklySummary({
  summary,
  isRegenerating,
  onRegenerate,
}: AIWeeklySummaryProps) {
  return (
    <Card className="border-teal-500/20 bg-teal-500/5">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-teal-600 dark:text-teal-400" />
          AI weekly summary
        </CardTitle>
        {onRegenerate ? (
          <Button
            disabled={isRegenerating}
            variant="outline"
            onClick={onRegenerate}
          >
            <RefreshCw className="size-4" />
            {isRegenerating ? "Regenerating..." : "Regenerate"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p className="text-base leading-relaxed">{summary.narrative}</p>

        {summary.patterns.length > 0 ? (
          <div>
            <p className="font-medium">Key patterns</p>
            <ul className="mt-2 grid gap-2">
              {summary.patterns.map((pattern) => (
                <li
                  key={pattern}
                  className="rounded-lg border bg-background/70 px-3 py-2 dark:border-white/10"
                >
                  {pattern}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary.suggestions.length > 0 ? (
          <div>
            <p className="font-medium">Personalized suggestions</p>
            <ul className="mt-2 grid gap-2">
              {summary.suggestions.map((suggestion) => (
                <li
                  key={suggestion}
                  className="rounded-lg border bg-background/70 px-3 py-2 dark:border-white/10"
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-700 dark:text-emerald-300">
          {summary.encouragement}
        </p>
      </CardContent>
    </Card>
  );
}