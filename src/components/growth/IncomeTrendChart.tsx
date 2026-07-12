"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

type IncomeTrendChartProps = {
  data: Array<{ month: string; income: number }>;
  target?: number;
};

const chartTick = { fill: "var(--muted-foreground)", fontSize: 12 };

export function IncomeTrendChart({ data, target = 0 }: IncomeTrendChartProps) {
  return (
    <div className="h-72">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tick={chartTick}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={chartTick}
            tickFormatter={(value) => `₹${Number(value) / 1000}k`}
            axisLine={{ stroke: "var(--border)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--card-foreground)",
            }}
            formatter={(value) => formatCurrency(Number(value))}
          />
          {target > 0 ? (
            <ReferenceLine
              label={{ value: "Target", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
              stroke="var(--chart-3)"
              strokeDasharray="4 4"
              y={target}
            />
          ) : null}
          <Line
            dataKey="income"
            dot={{ r: 3, fill: "var(--chart-1)" }}
            stroke="var(--chart-1)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}