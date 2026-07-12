"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendSeries } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/utils";

type TrendChartProps = {
  data: Array<Record<string, string | number>>;
  series?: TrendSeries[];
};

const chartTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const SMOOTH_CURVE = "monotone";

function cashFlowYDomain(max: number) {
  if (max <= 0) return 100;
  return Math.ceil(max * 1.08);
}

const chartAnimation = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: "ease-out" as const,
};

const defaultSeries: TrendSeries[] = [
  { key: "income", label: "Income", color: "#10b981", type: "income" },
  { key: "expense", label: "Expense", color: "#8B7FD4", type: "expense" },
];

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  color: "var(--card-foreground)",
  boxShadow: "var(--shadow-fintech-hover)",
  fontSize: 12,
  padding: "10px 12px",
};

function SeriesLegend({ series }: { series: TrendSeries[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {series.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function gradientId(key: string) {
  return `trend-grad-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function TrendChart({ data, series = defaultSeries }: TrendChartProps) {
  const useAreaChart = series.length <= 2;

  if (useAreaChart) {
    return (
      <div className="space-y-3">
        <SeriesLegend series={series} />
        <div className="h-60">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={data}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
            >
              <defs>
                {series.map((item) => (
                  <linearGradient
                    key={item.key}
                    id={gradientId(item.key)}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={item.color}
                      stopOpacity={item.type === "income" ? 0.35 : 0.3}
                    />
                    <stop offset="100%" stopColor={item.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={chartTick}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                domain={[0, cashFlowYDomain]}
                tick={chartTick}
                tickFormatter={(value) => `₹${Number(value) / 1000}k`}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
              {series.map((item, index) => (
                <Area
                  key={item.key}
                  activeDot={{
                    r: 5,
                    fill: item.color,
                    stroke: "var(--card)",
                    strokeWidth: 2.5,
                  }}
                  baseValue={0}
                  dataKey={item.key}
                  fill={`url(#${gradientId(item.key)})`}
                  name={item.label}
                  stroke={item.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  type={SMOOTH_CURVE}
                  animationBegin={index * 150}
                  {...chartAnimation}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SeriesLegend series={series} />
      <div className="h-60">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={data}
            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeOpacity={0.55}
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={chartTick}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              domain={[0, cashFlowYDomain]}
              tick={chartTick}
              tickFormatter={(value) => `₹${Number(value) / 1000}k`}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            {series.map((item, index) => (
              <Line
                key={item.key}
                dataKey={item.key}
                dot={false}
                name={item.label}
                stroke={item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                type={SMOOTH_CURVE}
                animationBegin={index * 120}
                {...chartAnimation}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}