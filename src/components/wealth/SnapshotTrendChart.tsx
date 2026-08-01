"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

type SnapshotTrendChartProps = {
  data: { label: string; netWorth: number }[];
};

const chartTick = { fill: "var(--muted-foreground)", fontSize: 11 };

/** Daily net-worth trend from real Daily Snapshot rows — distinct from the
 * 12-month NetWorthHistoryChart, which recomputes month-end totals live. */
export function SnapshotTrendChart({ data }: SnapshotTrendChartProps) {
  if (data.length < 2) return null;

  return (
    <div className="h-48">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={chartTick} tickLine={false} />
          <YAxis
            axisLine={false}
            tick={chartTick}
            tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            formatter={(value) => [formatCurrency(Number(value)), "Net Worth"]}
          />
          <Line
            dataKey="netWorth"
            dot={false}
            stroke="var(--chart-1)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
