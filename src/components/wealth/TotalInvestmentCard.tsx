"use client";

import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type TotalInvestmentCardProps = {
  totalInvested: number;
};

/** Wealth only needs total investment cost (from normal expense transactions). */
export function TotalInvestmentCard({ totalInvested }: TotalInvestmentCardProps) {
  return (
    <div className="sx-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Total investment cost
        </span>
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <TrendingUp className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
        {formatCurrency(totalInvested)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Sum of Add expense · category Investment. Also counted in Period
        Outflow, Cash Flow, and Top Categories. Not re-added to net worth.
      </p>
    </div>
  );
}
