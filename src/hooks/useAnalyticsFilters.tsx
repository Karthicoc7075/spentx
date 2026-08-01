"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { clearFilterChip } from "@/lib/analytics-filters";
import {
  defaultAnalyticsFilters,
  getDateRangeForPreset,
} from "@/lib/analytics";
import type { AnalyticsFilters } from "@/types";

function filtersAreEqual(a: AnalyticsFilters, b: AnalyticsFilters) {
  return JSON.stringify(a) === JSON.stringify(b);
}

type AnalyticsFiltersContextValue = {
  draftFilters: AnalyticsFilters;
  appliedFilters: AnalyticsFilters;
  hasPendingChanges: boolean;
  setFilters: (filters: AnalyticsFilters) => void;
  updateFilter: <K extends keyof AnalyticsFilters>(
    key: K,
    value: AnalyticsFilters[K],
  ) => void;
  setDatePreset: (preset: AnalyticsFilters["datePreset"]) => void;
  applyDraftFilters: () => void;
  resetFilters: () => void;
  applyFilters: (next: AnalyticsFilters) => void;
  applyPartialFilters: (partial: Partial<AnalyticsFilters>) => void;
  removeFilterChip: (chipKey: string) => void;
};

const AnalyticsFiltersContext = createContext<AnalyticsFiltersContextValue | null>(
  null,
);

// A persistent, app-wide setting (same pattern as GlobalFiltersProvider for
// the Dashboard) — kept alive across navigations so the Analysis page shows
// the same period you last set on it, instead of silently resetting to
// "this month" and dropping categories spent outside that window.
export function AnalyticsFiltersProvider({ children }: { children: ReactNode }) {
  const [draftFilters, setDraftFilters] =
    useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AnalyticsFilters>(defaultAnalyticsFilters);

  const hasPendingChanges = useMemo(
    () => !filtersAreEqual(draftFilters, appliedFilters),
    [draftFilters, appliedFilters],
  );

  const updateFilter = useCallback(
    <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
      setDraftFilters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const setDatePreset = useCallback((preset: AnalyticsFilters["datePreset"]) => {
    if (preset === "custom") {
      setDraftFilters((current) => ({ ...current, datePreset: preset }));
      return;
    }
    setDraftFilters((current) => ({
      ...current,
      datePreset: preset,
      ...getDateRangeForPreset(preset),
    }));
  }, []);

  const applyDraftFilters = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
  }, [draftFilters]);

  const resetFilters = useCallback(() => {
    setDraftFilters(defaultAnalyticsFilters);
    setAppliedFilters(defaultAnalyticsFilters);
  }, []);

  const applyFilters = useCallback((next: AnalyticsFilters) => {
    setDraftFilters(next);
    setAppliedFilters(next);
  }, []);

  const applyPartialFilters = useCallback((partial: Partial<AnalyticsFilters>) => {
    setDraftFilters((current) => {
      const next = { ...current, ...partial };
      setAppliedFilters(next);
      return next;
    });
  }, []);

  const removeFilterChip = useCallback((chipKey: string) => {
    if (chipKey === "datePreset" || chipKey === "dateRange") {
      const next = {
        ...defaultAnalyticsFilters,
        datePreset: "this-month" as const,
        ...getDateRangeForPreset("this-month"),
      };
      setDraftFilters(next);
      setAppliedFilters(next);
      return;
    }

    setAppliedFilters((current) => {
      const next = clearFilterChip(current, chipKey);
      setDraftFilters(next);
      return next;
    });
  }, []);

  const value = useMemo<AnalyticsFiltersContextValue>(
    () => ({
      draftFilters,
      appliedFilters,
      hasPendingChanges,
      setFilters: setDraftFilters,
      updateFilter,
      setDatePreset,
      applyDraftFilters,
      resetFilters,
      applyFilters,
      applyPartialFilters,
      removeFilterChip,
    }),
    [
      draftFilters,
      appliedFilters,
      hasPendingChanges,
      updateFilter,
      setDatePreset,
      applyDraftFilters,
      resetFilters,
      applyFilters,
      applyPartialFilters,
      removeFilterChip,
    ],
  );

  return (
    <AnalyticsFiltersContext.Provider value={value}>
      {children}
    </AnalyticsFiltersContext.Provider>
  );
}

export function useAnalyticsFilters() {
  const context = useContext(AnalyticsFiltersContext);
  if (!context) {
    throw new Error(
      "useAnalyticsFilters must be used within an AnalyticsFiltersProvider",
    );
  }

  return {
    draftFilters: context.draftFilters,
    appliedFilters: context.appliedFilters,
    filters: context.draftFilters,
    appliedFiltersForData: context.appliedFilters,
    hasPendingChanges: context.hasPendingChanges,
    setFilters: context.setFilters,
    updateFilter: context.updateFilter,
    setDatePreset: context.setDatePreset,
    applyDraftFilters: context.applyDraftFilters,
    resetFilters: context.resetFilters,
    applyFilters: context.applyFilters,
    applyPartialFilters: context.applyPartialFilters,
    removeFilterChip: context.removeFilterChip,
  };
}
