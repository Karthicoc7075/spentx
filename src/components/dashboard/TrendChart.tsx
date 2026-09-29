"use client";

import { useState } from "react";
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
import { cn, formatCurrency } from "@/lib/utils";

type TrendChartProps = {
  data: Array<Record<string, string | number>>;
  series?: TrendSeries[];
  selectedKey?: string | null;
  onSelectKey?: (key: string | null) => void;
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
  { key: "expense", label: "Expense", color: "#f43f5e", type: "expense" },
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

function SeriesLegend({
  series,
  selectedKey,
  onSelect,
}: {
  series: TrendSeries[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-all",
          selectedKey === null
            ? "bg-primary font-semibold text-primary-foreground shadow-sm"
            : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        All
      </button>
      {series.map((item) => {
        const isSelected = selectedKey === item.key;
        const isMuted = selectedKey !== null && !isSelected;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(isSelected ? null : item.key)}
            className={cn(
              "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-all",
              isSelected
                ? "font-bold shadow-sm ring-1 ring-inset"
                : isMuted
                  ? "bg-muted/40 text-muted-foreground/50 opacity-60 hover:opacity-100 hover:text-muted-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            style={
              isSelected
                ? {
                    backgroundColor: `${item.color}20`,
                    borderColor: item.color,
                    color: item.color,
                    boxShadow: `0 0 0 1px ${item.color}60`,
                  }
                : undefined
            }
            title={isSelected ? `Click to show all` : `Click to show only ${item.label}`}
          >
            <span
              className={cn(
                "size-2 rounded-full transition-transform",
                isSelected && "scale-125",
              )}
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function gradientId(key: string) {
  return `trend-grad-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function formatYAxisTick(value: unknown) {
  const num = Number(value);
  if (isNaN(num) || num === 0) return "₹0";
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}k`;
  return `₹${num}`;
}

export function TrendChart({
  data,
  series = defaultSeries,
  selectedKey: controlledKey,
  onSelectKey: controlledOnSelect,
}: TrendChartProps) {
  const [internalKey, setInternalKey] = useState<string | null>(null);
  const selectedKey = controlledKey !== undefined ? controlledKey : internalKey;
  const onSelect = controlledOnSelect !== undefined ? controlledOnSelect : setInternalKey;

  const activeSeries = selectedKey
    ? series.filter((item) => item.key === selectedKey)
    : series;

  const useAreaChart = activeSeries.length <= 2;
  const xAxisKey = data && data.length > 0 && data[0]?.label !== undefined ? "label" : "day";

  if (useAreaChart) {
    return (
      <div className="space-y-3">
        <SeriesLegend series={series} selectedKey={selectedKey} onSelect={onSelect} />
        <div className="h-60">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={data}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
            >
              <defs>
                {activeSeries.map((item) => (
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
                dataKey={xAxisKey}
                tick={chartTick}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                domain={[0, cashFlowYDomain]}
                tick={chartTick}
                tickFormatter={formatYAxisTick}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
              {activeSeries.map((item, index) => (
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
      <SeriesLegend series={series} selectedKey={selectedKey} onSelect={onSelect} />
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
              dataKey={xAxisKey}
              tick={chartTick}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              domain={[0, cashFlowYDomain]}
              tick={chartTick}
              tickFormatter={formatYAxisTick}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            {activeSeries.map((item, index) => (
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