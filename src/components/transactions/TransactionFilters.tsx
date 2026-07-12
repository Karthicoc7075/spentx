"use client";

import { ListFilter, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useContributors } from "@/hooks/useContributors";
import { usePurposes } from "@/hooks/usePurposes";
import { getDateRangeForDashboardPreset } from "@/lib/date-filters";
import { getActivePurposes } from "@/lib/purposes";
import { getCurrentPlanMonth } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type {
  DashboardDatePreset,
  GlobalFilters,
  TransactionType,
} from "@/types";

const datePresets: Array<{ value: DashboardDatePreset; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "last-12-months", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const sourceOptions = [
  { value: "", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "mobile", label: "Mobile" },
  { value: "import", label: "SMS Import" },
] as const;

const typeOptions: Array<{ value: "" | TransactionType; label: string }> = [
  { value: "", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

type TransactionFiltersProps = {
  filters: GlobalFilters;
  updateFilter: <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) => void;
  resetFilters: () => void;
};

export function TransactionFilters({
  filters,
  updateFilter,
  resetFilters,
}: TransactionFiltersProps) {
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { contributors } = useContributors();
  const { purposes } = usePurposes();
  const activePurposes = getActivePurposes(purposes);

  const visibleCategories =
    filters.transactionType === "income"
      ? categories.filter((category) => category.type === "income")
      : filters.transactionType === "expense"
        ? categories.filter((category) => category.type === "expense")
        : categories;

  const selectedCategory = filters.categories[0] ?? "";

  function applyDatePreset(preset: DashboardDatePreset) {
    const specificMonth = filters.specificMonth || getCurrentPlanMonth();
    const range = getDateRangeForDashboardPreset(preset, specificMonth);

    updateFilter("dashboardDatePreset", preset);
    updateFilter("dateFrom", range.dateFrom);
    updateFilter("dateTo", range.dateTo);

    if (preset === "this-month") {
      updateFilter("dashboardMonth", getCurrentPlanMonth());
    } else if (preset === "last-month") {
      updateFilter("dashboardMonth", range.dateFrom.slice(0, 7));
    }
  }

  function setTransactionType(value: "" | TransactionType) {
    updateFilter("transactionType", value);
    updateFilter("categories", []);
  }

  const activeFilterCount = [
    filters.search,
    filters.purposeId,
    filters.categories[0],
    filters.account,
    filters.transactionType,
    filters.contributorSource,
    filters.source,
    filters.dashboardDatePreset !== "this-month" ? "date" : "",
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ListFilter className="size-4" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight">Filters</h3>
          {activeFilterCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {activeFilterCount} active
            </span>
          ) : null}
        </div>
        <Button type="button" variant="ghost" onClick={resetFilters}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {/* Search + type toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="transaction-search"
            aria-label="Search transactions"
            className="h-10 rounded-full border-border bg-background pl-11 text-sm shadow-none"
            placeholder="Search by name, note, or tag..."
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
          />
        </div>

        <div className="inline-flex w-fit shrink-0 items-center rounded-full bg-muted p-1">
          {typeOptions.map((option) => {
            const active = filters.transactionType === option.value;
            return (
              <button
                key={option.value || "all"}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
                onClick={() => setTransactionType(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* Filter selects */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="date-preset">
            Date
          </Label>
          <select
            id="date-preset"
            className={selectClassName}
            value={filters.dashboardDatePreset}
            onChange={(event) =>
              applyDatePreset(event.target.value as DashboardDatePreset)
            }
          >
            {datePresets.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="purpose-filter">
            Purpose
          </Label>
          <select
            id="purpose-filter"
            className={selectClassName}
            value={filters.purposeId}
            onChange={(event) => updateFilter("purposeId", event.target.value)}
          >
            <option value="">All</option>
            {activePurposes.map((purpose) => (
              <option key={purpose.id} value={purpose.id}>
                {purpose.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="category-filter">
            Category
          </Label>
          <select
            id="category-filter"
            className={selectClassName}
            value={selectedCategory}
            onChange={(event) =>
              updateFilter(
                "categories",
                event.target.value ? [event.target.value] : [],
              )
            }
          >
            <option value="">All categories</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="account-filter">
            Account
          </Label>
          <select
            id="account-filter"
            className={selectClassName}
            value={filters.account}
            onChange={(event) => updateFilter("account", event.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.name}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label
            className="text-xs text-muted-foreground"
            htmlFor="contributor-filter"
          >
            Contributor
          </Label>
          <select
            id="contributor-filter"
            className={selectClassName}
            value={filters.contributorSource}
            onChange={(event) =>
              updateFilter(
                "contributorSource",
                event.target.value as GlobalFilters["contributorSource"],
              )
            }
          >
            <option value="">All</option>
            {contributors.map((contributor) => (
              <option key={contributor.id} value={contributor.name}>
                {contributor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="source-filter">
            Source
          </Label>
          <select
            id="source-filter"
            className={selectClassName}
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
          >
            {sourceOptions.map((source) => (
              <option key={source.value || "all"} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filters.dashboardDatePreset === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="date-from">
              From
            </Label>
            <Input
              id="date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="date-to">
              To
            </Label>
            <Input
              id="date-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
