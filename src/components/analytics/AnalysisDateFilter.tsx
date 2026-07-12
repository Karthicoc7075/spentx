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
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

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