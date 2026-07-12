"use client";

import { LucideIcon } from "lucide-react";
import { MiniSparkline } from "@/components/shared/MiniSparkline";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import type { KpiDelta } from "@/types";

type KpiCardProps = {
  title: string;
  value: string;
  change?: string;
  delta?: KpiDelta;
  sparkline?: number[];
  inlineMeta?: string;
  icon: LucideIcon;
  onClick?: () => void;
  tone?: "default" | "success" | "warning" | "danger";
};

const sparklineTone = {
  default: "stroke-[#8b7ff0]",
  success: "stroke-emerald-500",
  warning: "stroke-amber-500",
  danger: "stroke-rose-500",
};

export function KpiCard({
  title,
  value,
  change,
  delta,
  sparkline,
  inlineMeta,
  icon: Icon,
  onClick,
  tone = "default",
}: KpiCardProps) {
  const isPositive =
    delta?.percent != null ? delta.percent >= 0 : !change?.startsWith("-");

  const pillLabel =
    delta?.percent != null
      ? `${delta.percent >= 0 ? "+" : ""}${Math.round(delta.percent)}%`
      : null;

  return (
    <Card
      className={cn(
        "rounded-2xl border-border shadow-none transition-colors",
        onClick && "cursor-pointer hover:border-primary/50",
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Icon className="size-4 shrink-0 text-muted-foreground/60" />
        </div>
        <p className="mt-3 truncate text-[28px] font-bold leading-none tracking-tight">
          {value}
        </p>
        {inlineMeta ? (
          <p className="mt-2 text-xs text-muted-foreground">{inlineMeta}</p>
        ) : null}
        {change || delta ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isPositive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
              )}
            >
              {pillLabel ?? change ?? delta?.label}
            </span>
            <span>{pillLabel ? (delta?.label ?? change ?? "vs last month") : "vs last month"}</span>
            {delta?.amount != null && delta.amount !== 0 ? (
              <span className="font-medium text-foreground">
                {delta.amount > 0 ? "+" : ""}
                {formatCurrency(delta.amount)}
              </span>
            ) : null}
          </div>
        ) : null}
        {sparkline?.length ? (
          <div className="mt-3">
            <MiniSparkline data={sparkline} strokeClassName={sparklineTone[tone]} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
