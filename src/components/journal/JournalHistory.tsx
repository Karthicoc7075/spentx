"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWeekLabel } from "@/lib/journal";
import { cn } from "@/lib/utils";
import type { Reflection } from "@/types";

const moodEmoji = ["", "😫", "😕", "😐", "🙂", "😊"];

type JournalHistoryProps = {
  reflections: Reflection[];
  selectedWeek?: string;
  onSelect: (weekStart: string) => void;
};

export function JournalHistory({
  reflections,
  selectedWeek,
  onSelect,
}: JournalHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Past reflections</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {reflections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your reflection history will appear here after your first entry.
          </p>
        ) : (
          reflections.map((reflection) => (
            <button
              key={reflection.weekStart}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:border-primary/40 dark:border-white/10",
                selectedWeek === reflection.weekStart &&
                  "border-primary bg-primary/5",
              )}
              type="button"
              onClick={() => onSelect(reflection.weekStart)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {formatWeekLabel(reflection.weekStart)}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {reflection.aiSummary ??
                    (reflection.wins || "Reflection saved")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {moodEmoji[reflection.mood]} Mood {reflection.mood}/5
                  </Badge>
                  <Badge variant="outline">
                    Plan {reflection.planAdherence}%
                  </Badge>
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}