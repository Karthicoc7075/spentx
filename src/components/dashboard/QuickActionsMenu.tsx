"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  ChevronDown,
  MapPin,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type QuickActionsMenuProps = {
  onAddExpense: () => void;
  onAddIncome: () => void;
  onStartOuting: () => void;
  onMonthlyPlan: () => void;
};

const actions = [
  {
    key: "expense",
    label: "Add expense",
    description: "Log a new outflow",
    icon: ArrowDownCircle,
    iconClass: "bg-rose-500/12 text-rose-600 ring-rose-500/10 dark:text-rose-400",
  },
  {
    key: "income",
    label: "Add income",
    description: "Record inflow",
    icon: ArrowUpCircle,
    iconClass:
      "bg-emerald-500/12 text-emerald-600 ring-emerald-500/10 dark:text-emerald-400",
  },
  {
    key: "outing",
    label: "Start outing",
    description: "Split trip costs",
    icon: MapPin,
    iconClass: "bg-primary/12 text-primary ring-primary/10",
  },
  {
    key: "plan",
    label: "Set monthly plan",
    description: "Budget this month",
    icon: CalendarRange,
    iconClass: "bg-muted text-muted-foreground ring-border/50",
  },
] as const;

export function QuickActionsMenu({
  onAddExpense,
  onAddIncome,
  onStartOuting,
  onMonthlyPlan,
}: QuickActionsMenuProps) {
  const handlers = {
    expense: onAddExpense,
    income: onAddIncome,
    outing: onStartOuting,
    plan: onMonthlyPlan,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="gap-1.5 rounded-lg px-4 font-semibold shadow-sm transition-all duration-200 hover:shadow-md hover:ring-2 hover:ring-primary/20 active:scale-[0.97]">
            <Plus className="size-4" />
            Action
            <ChevronDown className="ml-0.5 size-3.5 opacity-70" />
          </Button>
        }
      />

      <DropdownMenuContent
        align="end"
        className="w-60 rounded-2xl border-border/60 p-1.5 shadow-xl"
      >
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              className="group cursor-pointer gap-3 rounded-xl px-2.5 py-2.5"
              onClick={() => handlers[action.key]()}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-105 ${action.iconClass}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold leading-none">
                  {action.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
