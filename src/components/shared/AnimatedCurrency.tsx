"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";

type AnimatedCurrencyProps = {
  value: number;
  className?: string;
  durationMs?: number;
};

export function AnimatedCurrency({
  value,
  className,
  durationMs = 400,
}: AnimatedCurrencyProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const from = displayValue;
    const delta = value - from;

    if (delta === 0) {
      setDisplayValue(value);
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(from + delta * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <span className={className}>{formatCurrency(displayValue)}</span>;
}