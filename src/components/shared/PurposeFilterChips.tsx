"use client";

import { getActivePurposes } from "@/lib/purposes";
import { cn } from "@/lib/utils";
import { usePurposes } from "@/hooks/usePurposes";

type PurposeFilterChipsProps = {
  value: string;
  onChange: (purposeId: string) => void;
  className?: string;
  showAllOption?: boolean;
};

export function PurposeFilterChips({
  value,
  onChange,
  className,
  showAllOption = true,
}: PurposeFilterChipsProps) {
  const { purposes } = usePurposes();
  const activePurposes = getActivePurposes(purposes);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {showAllOption ? (
        <button
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
            !value
              ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "border-border/70 bg-card/80 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
          )}
          type="button"
          onClick={() => onChange("")}
        >
          All
        </button>
      ) : null}
      {activePurposes.map((purpose) => {
        const active = value === purpose.id;
        return (
          <button
            key={purpose.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
              active
                ? "text-white shadow-sm"
                : "border-border/70 bg-card/80 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
            )}
            style={
              active
                ? {
                    backgroundColor: purpose.color,
                    borderColor: purpose.color,
                    boxShadow: `0 4px 12px ${purpose.color}33`,
                  }
                : undefined
            }
            type="button"
            onClick={() => onChange(purpose.id)}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                active ? "bg-white/90" : "ring-1 ring-border",
              )}
              style={active ? undefined : { backgroundColor: purpose.color }}
            />
            {purpose.name}
          </button>
        );
      })}
    </div>
  );
}