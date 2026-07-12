"use client";

import type { LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: number;
  prefix?: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: "default" | "primary" | "success" | "destructive";
  onClick?: () => void;
  className?: string;
};

export function StatCard({
  title,
  value,
  prefix = "₹",
  subtitle,
  icon: Icon,
  variant = "default",
  onClick,
  className,
}: StatCardProps) {
  const valueColor = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
  }[variant];

  const barColor = {
    default: "bg-primary",
    primary: "bg-primary",
    success: "bg-success",
    destructive: "bg-destructive",
  }[variant];

  return (
    <div
      className={cn(
        "fintech-card-hover relative flex h-full min-w-0 flex-col justify-between overflow-hidden p-4 sm:p-5 transition-all duration-200",
        onClick && "cursor-pointer select-none hover:border-primary/40 active:scale-[0.98]",
        className,
      )}
      onClick={onClick}
    >
      <div className={cn("absolute top-0 right-0 left-0 h-0.5", barColor)} />
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
          <span className="text-xs leading-tight font-medium text-muted-foreground sm:text-sm">
            {title}
          </span>
          {Icon ? (
            <Icon className="size-3.5 shrink-0 text-muted-foreground/70 sm:size-4" />
          ) : null}
        </div>
        <div
          className={cn(
            "truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl",
            valueColor,
          )}
        >
          {prefix === "₹" ? formatCurrency(value) : `${prefix}${value}`}
        </div>
      </div>
      {subtitle ? (
        <p className="mt-2.5 shrink-0 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}