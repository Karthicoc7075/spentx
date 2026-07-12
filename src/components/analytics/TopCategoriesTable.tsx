"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type TopCategoryRow = {
  name: string;
  value: number;
  color: string;
  percent: number;
  trend: number;
};

type TopCategoriesTableProps = {
  categories: TopCategoryRow[];
  onCategoryClick?: (category: string) => void;
};

export function TopCategoriesTable({
  categories,
  onCategoryClick,
}: TopCategoriesTableProps) {
  const topFive = categories.slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h3 className="mb-4 text-base font-semibold text-foreground">Top Categories</h3>
      {topFive.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Not enough data for this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Share</th>
                <th className="px-2 py-2 text-right">vs Last Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {topFive.map((category) => {
                const TrendIcon =
                  category.trend > 0
                    ? ArrowUpRight
                    : category.trend < 0
                      ? ArrowDownRight
                      : Minus;
                const trendColor =
                  category.trend > 0
                    ? "text-rose-500"
                    : category.trend < 0
                      ? "text-emerald-500"
                      : "text-muted-foreground";

                return (
                  <tr key={category.name}>
                    <td className="px-2 py-3">
                      <button
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                        type="button"
                        onClick={() => onCategoryClick?.(category.name)}
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </button>
                    </td>
                    <td className="px-2 py-3 text-right font-semibold">
                      {formatCurrency(category.value)}
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">
                      {category.percent}%
                    </td>
                    <td className={cn("px-2 py-3 text-right font-medium", trendColor)}>
                      <span className="inline-flex items-center justify-end gap-1">
                        <TrendIcon className="size-3.5" />
                        {Math.abs(category.trend)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}