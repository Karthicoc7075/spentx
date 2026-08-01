"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type CategoryBreakdownProps = {
  data: Array<{
    name: string;
    value: number;
    color: string;
    percent: number;
    trend: number;
  }>;
  onCategoryClick?: (category: string) => void;
};

const BAR_COUNT = 72;
const BAR_WIDTH = 4;
const BAR_GAP = 6;
const CHART_HEIGHT = 64;
const VISIBLE_CATEGORIES = 6;

function barHeight(index: number) {
  const wave =
    Math.abs(Math.sin(index * 1.7)) * 0.6 + Math.abs(Math.cos(index * 0.9)) * 0.4;
  return 18 + wave * (CHART_HEIGHT - 24);
}

export function CategoryBreakdown({ data, onCategoryClick }: CategoryBreakdownProps) {
  if (!data.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center text-center">
        <p className="font-medium">No expense data to analyse.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add transactions to see category breakdown.
        </p>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const thresholds: Array<{ end: number; color: string; name: string }> = [];
  let cumulative = 0;
  for (const item of data) {
    cumulative += total ? item.value / total : 0;
    thresholds.push({ end: cumulative, color: item.color, name: item.name });
  }

  function segmentForBar(index: number) {
    const position = (index + 0.5) / BAR_COUNT;
    return (
      thresholds.find((t) => position <= t.end) ??
      thresholds[thresholds.length - 1]
    );
  }

  const svgWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <svg
          className="w-full"
          height={CHART_HEIGHT}
          preserveAspectRatio="none"
          viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
        >
          {Array.from({ length: BAR_COUNT }).map((_, index) => {
            const segment = segmentForBar(index);
            const height = barHeight(index);
            return (
              <rect
                key={index}
                className={cn(onCategoryClick && "cursor-pointer")}
                fill={segment?.color ?? "#8b7ff0"}
                height={height}
                rx={BAR_WIDTH / 2}
                width={BAR_WIDTH}
                x={index * (BAR_WIDTH + BAR_GAP)}
                y={(CHART_HEIGHT - height) / 2}
                onClick={() => segment && onCategoryClick?.(segment.name)}
              >
                <title>{segment?.name}</title>
              </rect>
            );
          })}
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="max-h-[calc(4.25rem*6+0.5rem*5)] overflow-y-auto overscroll-contain pr-1 sm:max-h-[calc(4.25rem*3+0.5rem*2)]">
        <div className="grid gap-2 sm:grid-cols-2">
        {data.map((item) => {
          const trendPositive = item.trend >= 0;
          return (
            <button
              key={item.name}
              className="flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-3 text-left transition-colors hover:bg-muted"
              type="button"
              onClick={() => onCategoryClick?.(item.name)}
            >
              <span className="inline-flex min-w-0 items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-[4px]"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {item.trend !== 0 ? (
                      <>
                        {trendPositive ? (
                          <TrendingUp className="size-3 text-red-500" />
                        ) : (
                          <TrendingDown className="size-3 text-emerald-500" />
                        )}
                        {Math.abs(Math.round(item.trend))}% vs last period
                      </>
                    ) : (
                      "No change"
                    )}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-base font-bold tracking-tight tabular-nums">
                  {formatCurrency(item.value)}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {Math.round(item.percent)}%
                </span>
              </span>
            </button>
          );
        })}
        </div>
      </div>
      {data.length > VISIBLE_CATEGORIES ? (
        <p className="text-xs text-muted-foreground">
          Showing first {VISIBLE_CATEGORIES} categories — scroll for more.
        </p>
      ) : null}
    </div>
  );
}