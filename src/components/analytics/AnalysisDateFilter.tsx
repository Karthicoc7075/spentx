"use client";

import { Label } from "@/components/ui/label";
import { getDateRangeForPreset } from "@/lib/analytics";
import type { AnalyticsFilters } from "@/types";

const datePresets: Array<{
  value: AnalyticsFilters["datePreset"];
  label: string;
}> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
];

type AnalysisDateFilterProps = {
  preset: AnalyticsFilters["datePreset"];
  onPresetChange: (preset: AnalyticsFilters["datePreset"]) => void;
};

const selectClassName =
  "w-full sm:w-auto h-9 rounded-xl border border-input bg-card px-3 text-sm font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AnalysisDateFilter({
  preset,
  onPresetChange,
}: AnalysisDateFilterProps) {
  return (
    <div className="grid gap-1.5">
      <Label className="sr-only" htmlFor="analysis-date-preset">
        Date
      </Label>
      <select
        id="analysis-date-preset"
        className={selectClassName}
        value={preset}
        onChange={(event) =>
          onPresetChange(event.target.value as AnalyticsFilters["datePreset"])
        }
      >
        {datePresets.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function applyAnalysisDatePreset(preset: AnalyticsFilters["datePreset"]) {
  if (preset === "custom") {
    return { datePreset: preset };
  }

  return {
    datePreset: preset,
    ...getDateRangeForPreset(preset),
  };
}