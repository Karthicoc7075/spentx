"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardKpiKey } from "@/types";

export type { DashboardKpiKey };

export const DASHBOARD_KPI_OPTIONS: Array<{
  key: DashboardKpiKey;
  label: string;
}> = [
  { key: "net-worth", label: "Net Worth" },
  { key: "total-income", label: "Total Income" },
  { key: "total-expense", label: "Total Expense" },
  { key: "net-savings", label: "Net Savings" },
  { key: "cash-in-hand", label: "Cash in Hand" },
  { key: "bank-balance", label: "Bank Balance" },
  { key: "investment-value", label: "Investment Value" },
  { key: "monthly-balance", label: "Monthly Balance" },
];

export const DEFAULT_DASHBOARD_KPI_KEYS: DashboardKpiKey[] = [
  "net-worth",
  "total-income",
  "total-expense",
  "net-savings",
];

const STORAGE_KEY = "spentx-dashboard-kpi-config";

function isDashboardKpiKey(value: string): value is DashboardKpiKey {
  return DASHBOARD_KPI_OPTIONS.some((option) => option.key === value);
}

function normalizeKeys(keys: string[]): DashboardKpiKey[] {
  const valid = keys.filter(isDashboardKpiKey);
  if (valid.length === 0) return [...DEFAULT_DASHBOARD_KPI_KEYS];
  return valid;
}

function readStoredKeys(): DashboardKpiKey[] {
  if (typeof window === "undefined") return [...DEFAULT_DASHBOARD_KPI_KEYS];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_DASHBOARD_KPI_KEYS];
    const parsed = JSON.parse(raw) as string[];
    return normalizeKeys(parsed);
  } catch {
    return [...DEFAULT_DASHBOARD_KPI_KEYS];
  }
}

export function useDashboardKpiConfig() {
  const [activeKeys, setActiveKeys] = useState<DashboardKpiKey[]>(
    DEFAULT_DASHBOARD_KPI_KEYS,
  );

  useEffect(() => {
    setActiveKeys(readStoredKeys());
  }, []);

  const persist = useCallback((keys: DashboardKpiKey[]) => {
    const normalized = normalizeKeys(keys);
    setActiveKeys(normalized);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  const resetToDefault = useCallback(() => {
    persist([...DEFAULT_DASHBOARD_KPI_KEYS]);
  }, [persist]);

  return {
    activeKeys,
    setActiveKeys: persist,
    resetToDefault,
  };
}