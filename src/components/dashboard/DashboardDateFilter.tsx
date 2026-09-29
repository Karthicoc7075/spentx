"use client";

import { useMemo, useRef } from "react";
import { Calendar } from "lucide-react";
import { getDateRangeForDashboardPreset } from "@/lib/date-filters";
import { getCurrentPlanMonth } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { DashboardDatePreset } from "@/types";

const presets: Array<{ value: DashboardDatePreset; label: string }> = [
  { value: "last-7-days", label: "7d" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
];

function getPreviousMonthString(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const m = parseInt(mStr, 10);
  if (m === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(m - 1).padStart(2, "0")}`;
}

type DashboardDateFilterProps = {
  preset: DashboardDatePreset;
  specificMonth: string;
  minMonth?: string;
  maxMonth?: string;
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
  minMonth,
  maxMonth,
  onPresetChange,
  onSpecificMonthChange,
}: DashboardDateFilterProps) {
  const desktopInputRef = useRef<HTMLInputElement>(null);

  const effectiveMaxMonth = maxMonth || getCurrentPlanMonth();
  const prevMonth = getPreviousMonthString(effectiveMaxMonth);
  // Do not show "Last Month" preset if account was created in current month or after last month
  const canShowLastMonth = minMonth ? minMonth <= prevMonth : true;

  const visiblePresets = presets.filter((option) => {
    if (option.value === "last-month") {
      return canShowLastMonth;
    }
    return true;
  });

  const clampedMonthValue = useMemo(() => {
    let val = specificMonth || effectiveMaxMonth;
    if (minMonth && val < minMonth) val = minMonth;
    if (effectiveMaxMonth && val > effectiveMaxMonth) val = effectiveMaxMonth;
    return val;
  }, [specificMonth, minMonth, effectiveMaxMonth]);

  function handleMonthInputChange(rawMonth: string) {
    if (!rawMonth) return;
    let target = rawMonth;
    if (minMonth && target < minMonth) target = minMonth;
    if (effectiveMaxMonth && target > effectiveMaxMonth) target = effectiveMaxMonth;
    const range = getDateRangeForDashboardPreset("specific-month", target);
    onSpecificMonthChange(target, range);
  }

  return (
    <div className="inline-flex items-center gap-1.5 sm:gap-2 max-w-full">
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-border/40">
        {visiblePresets.map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 whitespace-nowrap",
              preset === option.value
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            type="button"
            onClick={() =>
              onPresetChange(
                option.value,
                getDateRangeForDashboardPreset(option.value, clampedMonthValue),
              )
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Custom Month Picker */}
      <div className="relative inline-flex items-center">
        {/* Mobile View: Shows clean calendar icon button (arrow icon removed) */}
        <div
          className={cn(
            "flex sm:hidden relative size-9 items-center justify-center rounded-xl border transition-all duration-150 active:scale-95",
            preset === "specific-month"
              ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary/30"
              : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          title="Select custom month"
        >
          <Calendar className="size-4 pointer-events-none" />
          {/* Overlay full input on mobile: triggers mobile native picker directly with 0 opacity and no arrows */}
          <input
            aria-label="Select custom month"
            className="absolute inset-0 size-full cursor-pointer opacity-0 [appearance:none] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="month"
            min={minMonth}
            max={effectiveMaxMonth}
            value={clampedMonthValue}
            onChange={(event) => handleMonthInputChange(event.target.value)}
          />
        </div>

        {/* Desktop View (>= sm): Shows input with Calendar icon and browser arrow removed */}
        <div
          className={cn(
            "hidden sm:flex items-center relative h-9 rounded-xl border border-input bg-background pl-2.5 pr-2 text-xs font-medium transition-all cursor-pointer",
            "focus-within:ring-2 focus-within:ring-ring/40",
            preset === "specific-month" &&
              "border-primary/50 bg-primary/5 ring-1 ring-primary/25",
          )}
          onClick={() => {
            try {
              desktopInputRef.current?.showPicker?.();
            } catch {
              desktopInputRef.current?.focus();
            }
          }}
        >
          <Calendar className="size-3.5 text-muted-foreground pointer-events-none mr-1.5 shrink-0" />
          <input
            ref={desktopInputRef}
            aria-label="Select custom month"
            className="bg-transparent text-xs font-medium text-foreground cursor-pointer focus:outline-none [appearance:none] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            type="month"
            min={minMonth}
            max={effectiveMaxMonth}
            value={clampedMonthValue}
            onChange={(event) => handleMonthInputChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
