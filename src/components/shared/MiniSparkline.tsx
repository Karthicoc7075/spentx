"use client";

import { cn } from "@/lib/utils";

type MiniSparklineProps = {
  data: number[];
  className?: string;
  strokeClassName?: string;
};

export function MiniSparkline({
  data,
  className,
  strokeClassName = "stroke-emerald-500",
}: MiniSparklineProps) {
  if (data.length < 2) return null;

  const width = 88;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden
      className={cn("overflow-visible", className)}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline
        className={cn("fill-none stroke-[1.5]", strokeClassName)}
        points={points}
      />
    </svg>
  );
}