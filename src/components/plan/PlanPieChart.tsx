"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";

type PlanPieChartProps = {
  data: Array<{ name: string; value: number; color: string }>;
  activeCategory?: string | null;
  onCategorySelect?: (category: string) => void;
};

export function PlanPieChart({
  data,
  activeCategory,
  onCategorySelect,
}: PlanPieChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground dark:border-white/10">
        Allocate amounts to see your plan breakdown.
      </div>
    );
  }

  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="space-y-4">
      <div className="h-44">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={3}
              onClick={(_, index) => onCategorySelect?.(data[index]?.name ?? "")}
            >
              {data.map((item) => (
                <Cell
                  key={item.name}
                  fill={item.color}
                  opacity={activeCategory && activeCategory !== item.name ? 0.35 : 1}
                  stroke={activeCategory === item.name ? "var(--foreground)" : "transparent"}
                  strokeWidth={activeCategory === item.name ? 1.5 : 0}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value, _name, item) => {
                const percent = total ? Math.round((Number(value) / total) * 100) : 0;
                return [`${formatCurrency(Number(value))} (${percent}%)`, item?.payload?.name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] max-h-36 overflow-y-auto pr-1">
        {data.map((item, idx) => {
          const pct = total ? Math.round((item.value / total) * 100) : 0;
          const isActive = activeCategory === item.name;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onCategorySelect?.(item.name)}
              className={`flex items-center justify-between p-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                isActive 
                  ? "border-primary bg-primary/5 font-semibold text-primary" 
                  : "border-border/50 bg-muted/10 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.name}</span>
              </div>
              <span className="font-bold shrink-0">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}