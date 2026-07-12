"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type QuickActionButtonProps = {
  description: string;
  compact?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  tone?: "expense" | "income" | "neutral";
};

const toneStyles = {
  expense: {
    card: "border-rose-500/20 bg-rose-500/5 hover:border-rose-500/35 hover:bg-rose-500/10",
    icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  income: {
    card: "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/35 hover:bg-emerald-500/10",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  neutral: {
    card: "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
    icon: "bg-muted text-muted-foreground",
  },
};

export function QuickActionButton({
  description,
  compact = false,
  disabled,
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: QuickActionButtonProps) {
  const styles = toneStyles[tone];

  return (
    <button
      className={cn(
        "flex w-full items-center text-left transition-colors",
        compact
          ? "gap-2 rounded-lg border px-2.5 py-1.5 min-h-9"
          : "gap-3 rounded-xl border p-4",
        styles.card,
        disabled && "cursor-not-allowed opacity-50",
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          compact ? "size-7 rounded-md" : "size-11 rounded-xl",
          styles.icon,
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-5"} />
      </span>
      <span className="min-w-0 truncate">
        <span
          className={cn(
            "block font-semibold leading-tight",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {label}
        </span>
        {!compact ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}