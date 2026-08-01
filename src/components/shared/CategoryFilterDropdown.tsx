"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCategoryIcon } from "@/lib/transaction-ui";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

type CategoryFilterDropdownProps = {
  categories: Category[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  triggerId?: string;
};

export function CategoryFilterDropdown({
  categories,
  selected,
  onChange,
  className,
  triggerId,
}: CategoryFilterDropdownProps) {
  const activeCategories = categories.filter((item) => item.isActive !== false);
  const income = activeCategories.filter((item) => item.type === "income");
  const expense = activeCategories.filter((item) => item.type === "expense");
  const selectedSet = new Set(selected);

  const label =
    selected.length === 0
      ? "All Categories"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} Categories`;

  function toggle(name: string, checked: boolean) {
    onChange(
      checked ? [...selected, name] : selected.filter((item) => item !== name),
    );
  }

  function renderGroup(groupLabel: string, items: Category[]) {
    if (items.length === 0) return null;
    return (
      // Menu.GroupLabel (DropdownMenuLabel) throws Base UI error #31 —
      // "MenuGroupContext is missing" — unless it's inside Menu.Group.
      <DropdownMenuGroup>
        <DropdownMenuLabel>{groupLabel}</DropdownMenuLabel>
        {items.map((category) => {
          const CategoryIcon = getCategoryIcon(category.name);
          return (
            <DropdownMenuCheckboxItem
              key={category.id}
              checked={selectedSet.has(category.name)}
              onCheckedChange={(checked) => toggle(category.name, checked)}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: category.color || "#10b981" }}
              />
              <CategoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{category.name}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuGroup>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            id={triggerId}
            type="button"
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              className,
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <div className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs">
          <button
            type="button"
            className="cursor-pointer font-semibold text-primary hover:underline"
            onClick={() => onChange(activeCategories.map((item) => item.name))}
          >
            Select all
          </button>
          <button
            type="button"
            className="cursor-pointer font-semibold text-muted-foreground hover:underline"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        </div>
        <DropdownMenuSeparator />
        {activeCategories.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No categories yet.
          </p>
        ) : (
          <>
            {renderGroup("Income", income)}
            {income.length > 0 && expense.length > 0 ? <DropdownMenuSeparator /> : null}
            {renderGroup("Expense", expense)}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
