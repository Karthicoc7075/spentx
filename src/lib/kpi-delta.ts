import { formatCurrency } from "@/lib/utils";
import type { KpiDelta } from "@/types";

export function formatAmountDelta(delta: KpiDelta, periodLabel = "last period") {
  if (delta.amount == null) return delta.label;
  if (delta.amount === 0) return `No change vs ${periodLabel}`;
  const prefix = delta.amount > 0 ? "+" : "";
  return `${prefix}${formatCurrency(delta.amount)} vs ${periodLabel}`;
}

export function formatPercentDelta(delta: KpiDelta, periodLabel = "last period") {
  if (delta.percent == null) return delta.label;
  if (delta.percent === 0) return `No change vs ${periodLabel}`;
  const prefix = delta.percent > 0 ? "+" : "";
  return `${prefix}${delta.percent.toFixed(1)}% vs ${periodLabel}`;
}