"use client";

import { cn } from "@/lib/utils";

type MiniSparklineProps = {
  data: Array<number | null>;
  className?: string;
  strokeClassName?: string;
};

export function MiniSparkline({
  data,
  className,
  strokeClassName = "stroke-emerald-500",
}: MiniSparklineProps) {
  const validValues = data.filter(
    (v): v is number => v !== null && !isNaN(v),
  );
  if (validValues.length < 2) return null;

  const width = 88;
  const height = 28;
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;

  // Group contiguous non-null points into segments so untracked periods
  // show a gap and never plunge to 0.
  const segments: string[][] = [];
  let currentSeg: string[] = [];

  data.forEach((value, index) => {
    if (value !== null && !isNaN(value)) {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      currentSeg.push(`${x},${y}`);
    } else {
      if (currentSeg.length > 0) {
        segments.push(currentSeg);
        currentSeg = [];
      }
    }
  });
  if (currentSeg.length > 0) {
    segments.push(currentSeg);
  }

  return (
    <svg
      aria-hidden
      className={cn("overflow-visible", className)}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          className={cn("fill-none stroke-[1.5]", strokeClassName)}
          points={seg.join(" ")}
        />
      ))}
    </svg>
  );
}