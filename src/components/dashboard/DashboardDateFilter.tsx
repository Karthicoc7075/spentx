"use client";

import { getDateRangeForDashboardPreset } from "@/lib/date-filters";
import { getCurrentPlanMonth } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { DashboardDatePreset } from "@/types";

const presets: Array<{ value: DashboardDatePreset; label: string }> = [
  { value: "last-7-days", label: "7d" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
];

type DashboardDateFilterProps = {
  preset: DashboardDatePreset;
  specificMonth: string;
  onPresetChange: (
    preset: DashboardDatePreset,
    range: { dateFrom: string; dateTo: string },
  ) => void;
  onSpecificMonthChange: (
    month: string,
    range: { dateFrom: string; dateTo: string },
  ) => void;
};

export function DashboardDateFilter({
  preset,
  specificMonth,
  onPresetChange,
  onSpecificMonthChange,
}: DashboardDateFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-border/40">
        {presets.map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95",
              preset === option.value
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            type="button"
            onClick={() =>
              onPresetChange(
                option.value,
                getDateRangeForDashboardPreset(option.value, specificMonth),
              )
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <input
        aria-label="Select custom month"
        className={cn(
          "h-9 rounded-xl border border-input bg-background px-2.5 text-xs font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          preset === "specific-month" &&
            "border-primary/50 bg-primary/5 ring-1 ring-primary/25",
        )}
        type="month"
        value={specificMonth || getCurrentPlanMonth()}
        onChange={(event) => {
          const range = getDateRangeForDashboardPreset(
            "specific-month",
            event.target.value,
          );
          onSpecificMonthChange(event.target.value, range);
        }}
      />
    </div>
  );
}
