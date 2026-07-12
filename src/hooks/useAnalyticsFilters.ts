"use client";

import { useCallback, useMemo, useState } from "react";
import { presetSavedViews, SAVED_VIEWS_STORAGE_KEY } from "@/lib/analytics-filter-config";
import { clearFilterChip } from "@/lib/analytics-filters";
import {
  defaultAnalyticsFilters,
  getDateRangeForPreset,
} from "@/lib/analytics";
import type { AnalyticsFilters, SavedAnalyticsFilterView } from "@/types";

function readSavedViews(): SavedAnalyticsFilterView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedAnalyticsFilterView[]) : [];
  } catch {
    return [];
  }
}

function writeSavedViews(views: SavedAnalyticsFilterView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
}

function normalizeSavedViewFilters(
  filters: Partial<AnalyticsFilters> & { comparePrevious?: boolean },
): AnalyticsFilters {
  const legacy = filters as AnalyticsFilters & { comparePrevious?: boolean };
  return {
    ...defaultAnalyticsFilters,
    ...filters,
    compareMode:
      filters.compareMode ?? (legacy.comparePrevious ? "previous-month" : ""),
  };
}

function filtersAreEqual(a: AnalyticsFilters, b: AnalyticsFilters) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useAnalyticsFilters() {
  const [draftFilters, setDraftFilters] =
    useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [savedViews, setSavedViews] = useState<SavedAnalyticsFilterView[]>(readSavedViews);

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

  // Spec A4.5 — Smart View Limits: max 10 saved views per user.
  const MAX_SAVED_VIEWS = 10;

  const saveCurrentView = useCallback(
    (name: string) => {
      const trimmedName = name.trim();
      const isReplacingExisting = savedViews.some(
        (item) => item.name === trimmedName,
      );

      if (!isReplacingExisting && savedViews.length >= MAX_SAVED_VIEWS) {
        return null;
      }

      const view: SavedAnalyticsFilterView = {
        id: crypto.randomUUID(),
        name: trimmedName,
        filters: { ...draftFilters },
      };
      const next = [view, ...savedViews.filter((item) => item.name !== view.name)];
      setSavedViews(next);
      writeSavedViews(next);
      return view;
    },
    [draftFilters, savedViews],
  );

  const applySavedView = useCallback((view: SavedAnalyticsFilterView) => {
    const next = normalizeSavedViewFilters(view.filters);
    setDraftFilters(next);
    setAppliedFilters(next);
  }, []);

  const deleteSavedView = useCallback((viewId: string) => {
    setSavedViews((current) => {
      const next = current.filter((item) => item.id !== viewId);
      writeSavedViews(next);
      return next;
    });
  }, []);

  const presetViews = useMemo(
    () =>
      presetSavedViews.map((preset) => ({
        id: preset.id,
        name: preset.name,
        filters: normalizeSavedViewFilters(preset.filters),
      })),
    [],
  );

  return {
    draftFilters,
    appliedFilters,
    filters: draftFilters,
    appliedFiltersForData: appliedFilters,
    hasPendingChanges,
    setFilters: setDraftFilters,
    updateFilter,
    setDatePreset,
    applyDraftFilters,
    resetFilters,
    applyFilters,
    applyPartialFilters,
    removeFilterChip,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    savedViews,
    presetViews,
  };
}