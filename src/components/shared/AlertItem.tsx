"use client";

import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SmartAlert } from "@/types";

const severityDot = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

type AlertItemProps = {
  alert: SmartAlert;
  onRead?: (id: string) => void;
  compact?: boolean;
};

export function AlertItem({ alert, onRead, compact = false }: AlertItemProps) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:border-primary/40 dark:border-white/10",
        !alert.read && "border-primary/20 bg-primary/5",
        compact && "px-2 py-2",
      )}
      type="button"
      onClick={() => onRead?.(alert.id)}
    >
      <span
        className={cn(
          "mt-1.5 size-2.5 shrink-0 rounded-full",
          severityDot[alert.severity],
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
            {alert.title}
          </p>
          {!alert.read ? (
            <span className="size-2 shrink-0 rounded-full bg-primary" />
          ) : null}
        </div>
        <p
          className={cn(
            "mt-1 text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {alert.message}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDateTime(alert.createdAt)}
        </p>
      </div>
    </button>
  );
}