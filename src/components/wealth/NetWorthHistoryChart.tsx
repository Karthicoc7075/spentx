"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { NetWorthHistoryPoint } from "@/types";

type NetWorthHistoryChartProps = {
  data: NetWorthHistoryPoint[];
};

const chartTick = { fill: "var(--muted-foreground)", fontSize: 11 };

export function NetWorthHistoryChart({ data }: NetWorthHistoryChartProps) {
  if (!data.length) {
    return null;
  }

  return (
    <div className="sx-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Net Worth History</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Twelve-month net worth trajectory.
        </p>
      </div>
      <div className="h-64">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tick={chartTick}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={chartTick}
              tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              formatter={(value) => [formatCurrency(Number(value)), "Net Worth"]}
            />
            <Area
              dataKey="netWorth"
              fill="url(#netWorthFill)"
              stroke="var(--chart-1)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}