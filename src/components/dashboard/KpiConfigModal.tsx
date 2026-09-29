"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
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

const KPI_DESCRIPTIONS: Record<DashboardKpiKey, string> = {
  "net-worth": "Total liquid assets across bank & cash accounts",
  "total-income": "All real earnings & inflow in period",
  "total-expense": "All spending including outing trip costs",
  "net-savings": "Net savings amount & savings rate % yield",
  "cash-in-hand": "Physical currency in cash accounts",
  "bank-balance": "Total balance across active bank accounts",
  "investment-value": "Total value of investment portfolio",
  "outing-spend": "Vacations & group trip expenses in period",
  "month-rollover": "Surplus or deficit carried from previous month",
};

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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const activeOptions = activeKeys
    .map((key) => DASHBOARD_KPI_OPTIONS.find((opt) => opt.key === key))
    .filter(Boolean) as typeof DASHBOARD_KPI_OPTIONS;

  const availableOptions = DASHBOARD_KPI_OPTIONS.filter(
    (opt) => !activeKeys.includes(opt.key),
  );

  function addKey(key: DashboardKpiKey) {
    if (!activeKeys.includes(key)) {
      onChange([...activeKeys, key]);
    }
  }

  function removeKey(key: DashboardKpiKey) {
    if (activeKeys.length <= 1) return;
    onChange(activeKeys.filter((item) => item !== key));
  }

  function moveKey(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activeKeys.length) return;
    const next = [...activeKeys];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, index: number) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetIndex: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const next = [...activeKeys];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg rounded-2xl p-0 overflow-hidden shadow-2xl border border-border/80 bg-background/95 backdrop-blur-md">
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-border/60 bg-gradient-to-b from-muted/40 via-muted/20 to-transparent">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 sm:size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
                <SlidersHorizontal className="size-4.5" />
              </span>
              <div>
                <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                  Customize Dashboard Cards
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Drag to rearrange or toggle cards on your dashboard
                </DialogDescription>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>
                {activeKeys.length}/{DASHBOARD_KPI_OPTIONS.length} Active
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 sm:px-6 py-4 space-y-5">
          {/* Active Cards Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-0.5">
              <span className="font-semibold text-foreground/80 tracking-wide uppercase text-[11px]">
                Active Deck ({activeKeys.length})
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                Drag handle or tap arrows to reorder
              </span>
            </div>

            <div className="space-y-2">
              {activeOptions.map((option, index) => {
                const Icon = kpiIcons[option.key];
                const accent = kpiAccent[option.key];
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={option.key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl border p-2.5 sm:p-3 transition-all select-none",
                      "bg-card/95 hover:bg-card border-border/70 hover:border-border shadow-xs",
                      isDragging &&
                        "opacity-30 scale-[0.98] border-dashed border-primary ring-2 ring-primary/30",
                      isDragOver &&
                        !isDragging &&
                        "border-primary bg-primary/[0.05] ring-2 ring-primary/25 translate-y-0.5 shadow-sm",
                      "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    {/* Drag Handle & Sequence Number */}
                    <div
                      className="flex items-center gap-1.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors"
                      title="Drag to rearrange"
                    >
                      <GripVertical className="size-4 shrink-0" />
                      <span className="flex size-5 items-center justify-center rounded-md bg-muted/80 text-[10px] font-mono font-semibold text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    {/* Card Icon */}
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 shadow-2xs",
                        accent.icon,
                      )}
                    >
                      <Icon className="size-4.5" />
                    </div>

                    {/* Card Details */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tracking-tight text-foreground truncate">
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {KPI_DESCRIPTIONS[option.key]}
                      </p>
                    </div>

                    {/* Reorder Buttons & Remove Action */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Segmented Up/Down Controls */}
                      <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 shadow-2xs">
                        <button
                          type="button"
                          aria-label={`Move ${option.label} up`}
                          disabled={index === 0}
                          className="rounded-md p-1 text-muted-foreground/80 hover:text-foreground hover:bg-background/90 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                          onClick={() => moveKey(index, -1)}
                          title="Move card up"
                        >
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${option.label} down`}
                          disabled={index === activeKeys.length - 1}
                          className="rounded-md p-1 text-muted-foreground/80 hover:text-foreground hover:bg-background/90 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                          onClick={() => moveKey(index, 1)}
                          title="Move card down"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      </div>

                      {/* Remove from Active Deck */}
                      <button
                        type="button"
                        aria-label={`Remove ${option.label}`}
                        disabled={activeKeys.length <= 1}
                        className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-rose-600 hover:bg-rose-500/10 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        onClick={() => removeKey(option.key)}
                        title={
                          activeKeys.length <= 1
                            ? "At least 1 card required"
                            : "Remove card"
                        }
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Available Cards Section */}
          <div className="pt-2 border-t border-border/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-0.5">
              <span className="font-semibold text-foreground/80 tracking-wide uppercase text-[11px]">
                Available Cards ({availableOptions.length})
              </span>
              {availableOptions.length > 0 ? (
                <span className="text-[11px] text-muted-foreground/70">
                  Tap card to add to dashboard
                </span>
              ) : null}
            </div>

            {availableOptions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {availableOptions.map((option) => {
                  const Icon = kpiIcons[option.key];
                  const accent = kpiAccent[option.key];

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => addKey(option.key)}
                      className={cn(
                        "group flex items-center justify-between gap-2.5 rounded-xl border border-dashed border-border/70 p-2.5 text-left transition-all",
                        "bg-muted/20 hover:bg-primary/[0.03] hover:border-primary/40 hover:shadow-xs",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 opacity-75 group-hover:opacity-100 transition-opacity",
                            accent.icon,
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {option.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {KPI_DESCRIPTIONS[option.key]}
                          </p>
                        </div>
                      </div>

                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-2xs">
                        <Plus className="size-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/30 border border-border/50 py-3 px-4 text-xs text-muted-foreground">
                <Check className="size-4 text-emerald-500 shrink-0" />
                <span>All {DASHBOARD_KPI_OPTIONS.length} cards are currently active on your dashboard.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-5 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between gap-2">
          <Button
            className="rounded-[0.5rem] gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium"
            type="button"
            variant="ghost"
            onClick={onReset}
          >
            <RotateCcw className="size-3.5" />
            Reset to default
          </Button>
          <Button
            className="rounded-[0.5rem] px-5 font-semibold text-xs sm:text-sm shadow-xs"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}