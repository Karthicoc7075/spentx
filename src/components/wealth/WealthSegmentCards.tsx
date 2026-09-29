"use client";

import { Banknote, Landmark, TrendingUp, Wallet } from "lucide-react";
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
    segment: "wallet" as const,
    label: "Wallets",
    key: "wallets" as const,
    icon: Wallet,
    countLabel: (count: number) =>
      count === 1 ? "1 wallet" : `${count} wallets`,
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
      count > 0 ? `${count} accounts` : "Invested capital",
  },
];

export function WealthSegmentCards({
  breakdown,
  accounts,
  activeFilter,
  onFilter,
}: WealthSegmentCardsProps) {
  const accountCounts = {
    bank: accounts.filter((account) => account.type === "bank").length,
    wallet: accounts.filter((account) => account.type === "wallet").length,
    cash: accounts.filter((account) => account.type === "cash").length,
    investment: accounts.filter(
      (account) =>
        account.type === "investment" ||
        account.type === "mutual_fund" ||
        account.type === "stocks",
    ).length,
  };

  // If wallet count is 0, hide the Wallets card completely
  const visibleSegments = segments.filter((card) => {
    if (card.segment === "wallet" && accountCounts.wallet === 0) {
      return false;
    }
    return true;
  });

  // Determine active segment even if an individual account is selected
  const activeSegmentKey = (() => {
    if (activeFilter.type === "segment") {
      return activeFilter.segment;
    }
    if (activeFilter.type === "account") {
      const match = accounts.find(
        (a) =>
          a.name.trim().toLowerCase() ===
          activeFilter.accountName.trim().toLowerCase(),
      );
      if (match?.type === "bank") return "bank";
      if (match?.type === "wallet") return "wallet";
      if (match?.type === "cash") return "cash";
      if (
        match?.type === "investment" ||
        match?.type === "mutual_fund" ||
        match?.type === "stocks"
      ) {
        return "investment";
      }
      return "bank";
    }
    return "bank"; // Default to bank
  })();

  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-3.5",
        visibleSegments.length === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {visibleSegments.map((card, index) => {
        const Icon = card.icon;
        const isActive = activeSegmentKey === card.segment;
        const count = accountCounts[card.segment];
        const isThirdOfThree = visibleSegments.length === 3 && index === 2;

        return (
          <button
            key={card.segment}
            className={cn(
              "sx-surface-interactive p-3 sm:p-4.5 md:p-5 text-left transition-all cursor-pointer rounded-2xl border",
              isActive
                ? "border-primary bg-primary/[0.04] ring-2 ring-primary/20 shadow-sm"
                : "border-border hover:border-border/90",
              isThirdOfThree && "col-span-2 sm:col-span-1",
            )}
            type="button"
            onClick={() => {
              onFilter({ type: "segment", segment: card.segment });
            }}
          >
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-semibold text-foreground/80 truncate">
                {card.label}
              </span>
              <span
                className={cn(
                  "flex size-7 sm:size-8 items-center justify-center rounded-xl shrink-0 transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-3.5 sm:size-4" />
              </span>
            </div>
            <p className="mt-2 sm:mt-3 text-base sm:text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground truncate">
              {formatCurrency(breakdown[card.key])}
            </p>
            <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground truncate">
              {card.countLabel(count)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
