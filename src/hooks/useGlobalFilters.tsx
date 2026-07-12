"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { createDefaultGlobalFilters } from "@/lib/filter-defaults";
import type { GlobalFilters } from "@/types";

const initialFilters: GlobalFilters = createDefaultGlobalFilters();

type GlobalFiltersContextValue = {
  filters: GlobalFilters;
  setFilters: (filters: GlobalFilters) => void;
  updateFilter: <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) => void;
  resetFilters: () => void;
};

const GlobalFiltersContext = createContext<GlobalFiltersContextValue>({
  filters: initialFilters,
  setFilters: () => undefined,
  updateFilter: () => undefined,
  resetFilters: () => undefined,
});

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState(initialFilters);

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setFilters,
      updateFilter: (key, value) =>
        setFilters((current) => ({
          ...current,
          [key]: value,
        })),
      resetFilters: () => setFilters(initialFilters),
    }),
    [filters],
  );

  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export function useGlobalFilters() {
  return useContext(GlobalFiltersContext);
}
