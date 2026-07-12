"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";

const sources = ["manual", "mobile", "bank-sync", "import"];

export function GlobalFilters() {
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { filters, updateFilter, resetFilters } = useGlobalFilters();

  function toggleCategory(category: string) {
    updateFilter(
      "categories",
      filters.categories.includes(category)
        ? filters.categories.filter((item) => item !== category)
        : [...filters.categories, category],
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 dark:border-white/10 dark:bg-black/70">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_auto]">
        <Input
          aria-label="From date"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => updateFilter("dateFrom", event.target.value)}
        />
        <Input
          aria-label="To date"
          type="date"
          value={filters.dateTo}
          onChange={(event) => updateFilter("dateTo", event.target.value)}
        />
        <select
          aria-label="Account"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
        <select
          aria-label="Source"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          value={filters.source}
          onChange={(event) => updateFilter("source", event.target.value)}
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="Minimum amount"
            inputMode="numeric"
            placeholder="Min"
            value={filters.minAmount}
            onChange={(event) => updateFilter("minAmount", event.target.value)}
          />
          <Input
            aria-label="Maximum amount"
            inputMode="numeric"
            placeholder="Max"
            value={filters.maxAmount}
            onChange={(event) => updateFilter("maxAmount", event.target.value)}
          />
        </div>
        <Button onClick={resetFilters} variant="outline">
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const isActive = filters.categories.includes(category.name);

          return (
            <button
              key={category.id}
              className={`inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-3 text-xs transition-colors ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground dark:border-white/12 dark:bg-white/[0.03] dark:hover:border-white/20"
              }`}
              type="button"
              onClick={() => toggleCategory(category.name)}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
