"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPlanMonthShort, shiftPlanMonth } from "@/lib/plan";

type PlanMonthSelectorProps = {
  month: string;
  onChange: (month: string) => void;
};

export function PlanMonthSelector({ month, onChange }: PlanMonthSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label="Previous month"
        className="size-9"
        size="icon-sm"
        type="button"
        variant="outline"
        onClick={() => onChange(shiftPlanMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[7.5rem] text-center text-sm font-medium text-foreground">
        {formatPlanMonthShort(month)}
      </span>
      <Button
        aria-label="Next month"
        className="size-9"
        size="icon-sm"
        type="button"
        variant="outline"
        onClick={() => onChange(shiftPlanMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}