"use client";

import { cn } from "@/lib/utils";

type FilterChipsProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterChipsProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground",
          )}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}