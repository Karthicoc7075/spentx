"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";

export function GlobalSearch() {
  const { filters, updateFilter } = useGlobalFilters();

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search transactions"
        className="h-10 rounded-full border-border bg-background pl-11 pr-14 text-sm shadow-none"
        placeholder="Search..."
        value={filters.search}
        onChange={(event) => updateFilter("search", event.target.value)}
      />
      <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </div>
  );
}
