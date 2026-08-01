"use client";

import { Banknote, Landmark, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Account, NetWorthBreakdown, WealthFilter } from "@/types";

type WealthSegmentCardsProps = {
  breakdown: NetWorthBreakdown;
  accounts: Account[];
  activeFilter: WealthFilter;
  onFilter: (filter: WealthFilter) => void;
};

const segments = [
  {
    segment: "bank" as const,
    label: "Bank Accounts",
    key: "bankAccounts" as const,
    icon: Landmark,
    countLabel: (count: number) =>
      count === 1 ? "1 account" : `${count} accounts`,
  },
  {
    segment: "cash" as const,
    label: "Cash",
    key: "cash" as const,
    icon: Banknote,
    countLabel: (count: number) =>
      count === 1 ? "1 account" : `${count} accounts`,
  },
  {
    segment: "investment" as const,
    label: "Investments",
    key: "investmentValue" as const,
    icon: TrendingUp,
    countLabel: (count: number) =>
      count > 0 ? `${count} accounts` : "Investment categories",
  },
];

export function WealthSegmentCards({
  breakdown,
  accounts,
  activeFilter,
  onFilter,
}: WealthSegmentCardsProps) {
  const accountCounts = {
    bank: accounts.filter(
      (account) => account.type === "bank" || account.type === "wallet",
    ).length,
    cash: accounts.filter((account) => account.type === "cash").length,
    investment: accounts.filter(
      (account) =>
        account.type === "investment" ||
        account.type === "mutual_fund" ||
        account.type === "stocks",
    ).length,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {segments.map((card) => {
        const Icon = card.icon;
        const isActive =
          activeFilter.type === "segment" &&
          activeFilter.segment === card.segment;
        const count = accountCounts[card.segment];

        return (
          <button
            key={card.segment}
            className={cn(
              "sx-surface-interactive p-5 text-left",
              isActive && "border-primary/50 ring-2 ring-primary/15",
            )}
            type="button"
            onClick={() => onFilter({ type: "segment", segment: card.segment })}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {card.label}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
              {formatCurrency(breakdown[card.key])}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {card.countLabel(count)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
