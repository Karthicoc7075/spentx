"use client";

import { formatCurrency } from "@/lib/utils";
import type { ContributorSource } from "@/types";

type ContributorItem = {
  source: ContributorSource;
  amount: number;
  percent: number;
};

type ContributorBreakdownProps = {
  contributors: ContributorItem[];
};

const contributorColorPalette = [
  "#6366F1",
  "#14B8A6",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#22C55E",
  "#64748B",
];

function getContributorColor(source: ContributorSource): string {
  if (source === "Me") return contributorColorPalette[0];
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return contributorColorPalette[1 + (hash % (contributorColorPalette.length - 1))];
}

export function ContributorBreakdown({ contributors }: ContributorBreakdownProps) {
  const maxAmount = Math.max(...contributors.map((item) => item.amount), 1);

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Contributions</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Income breakdown by contributor. Home/Family only.
        </p>
      </div>

      {contributors.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No contributor income in this period.
        </p>
      ) : (
        <div className="grid gap-4">
          {contributors.map((item) => (
            <div key={item.source} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{item.source}</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(item.amount)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(8, (item.amount / maxAmount) * 100)}%`,
                    backgroundColor: getContributorColor(item.source),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}