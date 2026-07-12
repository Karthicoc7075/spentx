"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonalizedSuggestion as Suggestion } from "@/types";

const toneClasses = {
  success:
    "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  info: "border-primary/15 bg-primary/5 text-foreground",
};

type PersonalizedSuggestionProps = {
  suggestion: Suggestion;
  compact?: boolean;
};

export function PersonalizedSuggestion({
  suggestion,
  compact = false,
}: PersonalizedSuggestionProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        toneClasses[suggestion.tone],
        compact && "px-3 py-2",
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 opacity-80" />
        <div className="min-w-0">
          <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {suggestion.title}
          </p>
          <p
            className={cn(
              "mt-1 text-muted-foreground",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {suggestion.message}
          </p>
        </div>
      </div>
    </div>
  );
}