"use client";

import { formatCurrency } from "@/lib/utils";

type CategoryChartProps = {
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
};

const BAR_COUNT = 56;
const BAR_WIDTH = 4;
const BAR_GAP = 6;
const CHART_HEIGHT = 56;

function barHeight(index: number) {
  const wave =
    Math.abs(Math.sin(index * 1.7)) * 0.6 + Math.abs(Math.cos(index * 0.9)) * 0.4;
  return 16 + wave * (CHART_HEIGHT - 20);
}

export function CategoryChart({ data }: CategoryChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Assign each bar a color based on cumulative category share.
  const thresholds: Array<{ end: number; color: string }> = [];
  let cumulative = 0;
  for (const item of data) {
    cumulative += total ? item.value / total : 0;
    thresholds.push({ end: cumulative, color: item.color });
  }

  function colorForBar(index: number) {
    const position = (index + 0.5) / BAR_COUNT;
    const match = thresholds.find((t) => position <= t.end);
    return match?.color ?? thresholds[thresholds.length - 1]?.color ?? "#8b7ff0";
  }

  const svgWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="shrink-0">
        <svg
          className="w-full"
          height={CHART_HEIGHT}
          preserveAspectRatio="none"
          viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
        >
          {Array.from({ length: BAR_COUNT }).map((_, index) => {
            const height = barHeight(index);
            return (
              <rect
                key={index}
                fill={colorForBar(index)}
                height={height}
                rx={BAR_WIDTH / 2}
                width={BAR_WIDTH}
                x={index * (BAR_WIDTH + BAR_GAP)}
                y={(CHART_HEIGHT - height) / 2}
              />
            );
          })}
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Extra categories scroll inside the panel so height matches Cash Flow. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <div className="grid divide-y divide-border">
          {data.map((item) => {
            const pct = total ? Math.round((item.value / total) * 100) : 0;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="inline-flex min-w-0 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-[4px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate text-sm font-medium text-muted-foreground">
                    {item.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-lg font-bold tracking-tight tabular-nums">
                    {formatCurrency(item.value)}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {pct}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
