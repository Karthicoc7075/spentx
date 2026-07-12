"use client";

import {
  Banknote,
  Landmark,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Account, NetWorthBreakdown, WealthFilter } from "@/types";

type WealthSegmentCardsProps = {
  breakdown: NetWorthBreakdown;
  accounts: Account[];
  investmentCount: number;
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
    segment: "wallet" as const,
    label: "Wallets",
    key: "wallet" as const,
    icon: Smartphone,
    countLabel: (count: number) => (count === 0 ? "—" : `${count} account${count === 1 ? "" : "s"}`),
  },
  {
    segment: "investments" as const,
    label: "Investments",
    key: "investments" as const,
    icon: TrendingUp,
    countLabel: (count: number) =>
      count === 1 ? "1 holding" : `${count} holdings`,
    note: "Not included in net worth.",
  },
];

export function WealthSegmentCards({
  breakdown,
  accounts,
  investmentCount,
  activeFilter,
  onFilter,
}: WealthSegmentCardsProps) {
  const accountCounts = {
    bank: accounts.filter((account) => account.type === "bank").length,
    cash: accounts.filter((account) => account.type === "cash").length,
    wallet: accounts.filter((account) => account.type === "wallet").length,
    investments: investmentCount,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {segments.map((card) => {
        const Icon = card.icon;
        const isActive =
          activeFilter.type === "segment" &&
          activeFilter.segment === card.segment;
        const count =
          card.segment === "investments"
            ? investmentCount
            : accountCounts[card.segment];

        return (
          <button
            key={card.segment}
            className={cn(
              "rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40",
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
              {card.note ? ` · ${card.note}` : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}