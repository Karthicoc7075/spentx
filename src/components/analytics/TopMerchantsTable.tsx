"use client";

import { Store } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type MerchantRow = {
  merchant: string;
  amount: number;
};

type TopMerchantsTableProps = {
  merchants: MerchantRow[];
  periodLabel?: string;
  activeMerchant?: string | null;
  onMerchantClick?: (merchant: string) => void;
};

const VISIBLE_ROWS = 4;
const ROW_HEIGHT_REM = 4.5;
const ROW_GAP_REM = 0.5;

export function TopMerchantsTable({
  merchants,
  periodLabel,
  activeMerchant,
  onMerchantClick,
}: TopMerchantsTableProps) {
  const totalSpend = merchants.reduce((sum, item) => sum + item.amount, 0);
  const maxAmount = Math.max(...merchants.map((item) => item.amount), 1);
  const scrollMaxHeight = `calc(${ROW_HEIGHT_REM}rem * ${VISIBLE_ROWS} + ${ROW_GAP_REM}rem * ${VISIBLE_ROWS - 1})`;

  return (
    <div className="sx-surface flex h-full flex-col p-6">
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Top Merchants</h3>
          {merchants.length > 0 ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {merchants.length} total
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {periodLabel
            ? `Merchants & outing names in ${periodLabel} — first ${VISIBLE_ROWS} shown, scroll for more.`
            : `Merchants & outing names — first ${VISIBLE_ROWS} shown, scroll for more.`}
        </p>
      </div>

      {merchants.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 py-12 text-center">
          <Store className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            No merchant spending in this period.
          </p>
        </div>
      ) : (
        <div
          className="overflow-y-auto overscroll-contain pr-1"
          style={{ maxHeight: scrollMaxHeight }}
        >
          <div className="grid gap-2">
            {merchants.map((item, index) => {
              const share =
                totalSpend > 0 ? Math.round((item.amount / totalSpend) * 100) : 0;
              const isActive = activeMerchant === item.merchant;

              return (
                <button
                  key={`${item.merchant}-${index}`}
                  type="button"
                  className={cn(
                    "grid h-[4.5rem] w-full shrink-0 gap-1.5 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/40",
                    isActive && "border-primary/30 bg-primary/5",
                  )}
                  onClick={() => onMerchantClick?.(item.merchant)}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2.5 font-medium">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="truncate">{item.merchant}</span>
                    </span>
                    <span className="shrink-0 font-mono font-semibold tabular-nums">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{
                        width: `${Math.max(6, (item.amount / maxAmount) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {share}% of merchant spend
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}