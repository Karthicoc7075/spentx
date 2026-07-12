"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type FitsIncomeBannerProps = {
  expectedIncome: number;
  totalPlanned: number;
};

export function FitsIncomeBanner({
  expectedIncome,
  totalPlanned,
}: FitsIncomeBannerProps) {
  if (expectedIncome <= 0 && totalPlanned <= 0) return null;

  const remaining = expectedIncome - totalPlanned;
  const fits = totalPlanned <= expectedIncome;
  const exact = totalPlanned === expectedIncome && expectedIncome > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3",
        fits
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
      )}
    >
      {fits ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {fits
            ? exact
              ? "Planned spending exactly matches expected income."
              : "Planned spending fits within income."
            : `Planned spending exceeds expected income by ${formatCurrency(Math.abs(remaining))}.`}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          {formatCurrency(totalPlanned)} planned · {formatCurrency(expectedIncome)} expected
          {fits ? ` · ${formatCurrency(remaining)} remaining` : null}
        </p>
      </div>
    </div>
  );
}