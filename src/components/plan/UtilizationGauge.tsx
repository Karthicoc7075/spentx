"use client";

import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";

type UtilizationGaugeProps = {
  utilization: number;
};

export function UtilizationGauge({ utilization }: UtilizationGaugeProps) {
  const value = Math.min(utilization, 100);
  
  const tone =
    utilization <= 100
      ? "text-emerald-500 stroke-emerald-500 bg-emerald-500/10 border-emerald-500/20"
      : utilization <= 115
        ? "text-amber-500 stroke-amber-500 bg-amber-500/10 border-amber-500/20"
        : "text-rose-500 stroke-rose-500 bg-rose-500/10 border-rose-500/20";

  const isOver = utilization > 100;

  // Circle properties
  const radius = 24;
  const circ = 2 * Math.PI * radius;
  const strokeOffset = circ - (value / 100) * circ;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 dark:border-white/10 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative flex size-16 shrink-0 items-center justify-center">
          <svg className="size-full -rotate-90">
            <circle
              cx="32"
              cy="32"
              r={radius}
              className="stroke-muted/40 dark:stroke-white/5"
              strokeWidth="4.5"
              fill="transparent"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              className={cn("transition-all duration-500", !isOver ? "stroke-emerald-500" : "stroke-rose-500")}
              strokeWidth="4.5"
              fill="transparent"
              strokeDasharray={circ}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <Coins className={cn("size-5", !isOver ? "text-emerald-500" : "text-rose-500")} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Budget Utilization
            </span>
            <span className={cn("text-base font-extrabold", !isOver ? "text-emerald-500" : "text-rose-500")}>
              {utilization}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {utilization <= 100
              ? "Share of expected income allocated across categories."
              : "Planned spending exceeds expected income."}
          </p>
        </div>
      </div>
    </div>
  );
}