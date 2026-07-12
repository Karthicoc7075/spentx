"use client";

import { Check, ChevronDown, ChevronUp, GripVertical, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { kpiAccent, kpiIcons } from "@/lib/dashboard-kpi-meta";
import {
  DASHBOARD_KPI_OPTIONS,
  type DashboardKpiKey,
} from "@/hooks/useDashboardKpiConfig";
import { cn } from "@/lib/utils";

type KpiConfigModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeKeys: DashboardKpiKey[];
  onChange: (keys: DashboardKpiKey[]) => void;
  onReset: () => void;
};

export function KpiConfigModal({
  open,
  onOpenChange,
  activeKeys,
  onChange,
  onReset,
}: KpiConfigModalProps) {
  function toggleKey(key: DashboardKpiKey) {
    if (activeKeys.includes(key)) {
      if (activeKeys.length <= 1) return;
      onChange(activeKeys.filter((item) => item !== key));
      return;
    }
    onChange([...activeKeys, key]);
  }

  function moveKey(key: DashboardKpiKey, direction: -1 | 1) {
    const index = activeKeys.indexOf(key);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activeKeys.length) return;

    const next = [...activeKeys];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
              <Settings2 className="size-4" />
            </span>
            Customise cards
          </DialogTitle>
          <DialogDescription>
            Choose which metrics to display, and reorder the active ones.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {DASHBOARD_KPI_OPTIONS.map((option) => {
            const isActive = activeKeys.includes(option.key);
            const orderIndex = activeKeys.indexOf(option.key);
            const Icon = kpiIcons[option.key];
            const accent = kpiAccent[option.key];

            return (
              <div
                key={option.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200",
                  isActive
                    ? "border-primary/25 bg-primary/[0.04] shadow-sm"
                    : "border-border/60 bg-transparent hover:border-border hover:bg-muted/30",
                )}
              >
                {isActive ? (
                  <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden />
                )}

                <button
                  aria-pressed={isActive}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-transform duration-200",
                    isActive ? accent.icon : "bg-muted text-muted-foreground/60 ring-border/50",
                  )}
                  type="button"
                  onClick={() => toggleKey(option.key)}
                >
                  <Icon className="size-4" />
                </button>

                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    checked={isActive}
                    className="sr-only"
                    type="checkbox"
                    onChange={() => toggleKey(option.key)}
                  />
                  {option.label}
                </label>

                {isActive ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                ) : null}

                {isActive ? (
                  <div className="ml-1 flex items-center gap-0.5 border-l border-border/60 pl-1.5">
                    <Button
                      aria-label={`Move ${option.label} up`}
                      className="rounded-lg"
                      disabled={orderIndex === 0}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => moveKey(option.key, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Move ${option.label} down`}
                      className="rounded-lg"
                      disabled={orderIndex === activeKeys.length - 1}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => moveKey(option.key, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            className="rounded-xl"
            type="button"
            variant="outline"
            onClick={onReset}
          >
            Reset to default
          </Button>
          <Button className="rounded-xl" type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}