import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Landmark,
  LineChart,
  PiggyBank,
  Wallet,
} from "lucide-react";
import type { DashboardKpiKey } from "@/hooks/useDashboardKpiConfig";

export const kpiIcons = {
  "net-worth": CircleDollarSign,
  "total-income": ArrowUpRight,
  "total-expense": ArrowDownRight,
  "net-savings": PiggyBank,
  "cash-in-hand": Banknote,
  "bank-balance": Landmark,
  "investment-value": LineChart,
  "monthly-balance": Wallet,
} as const;

/**
 * Restrained, enterprise accent system. A single neutral treatment is used for
 * balance-style metrics, with semantic emerald/red reserved for money direction
 * and the brand tone used only for headline figures. `icon` holds the flat tile
 * classes; `tone` drives any secondary emphasis in the card.
 */
export const kpiAccent: Record<
  DashboardKpiKey,
  {
    tone: "brand" | "positive" | "negative" | "neutral";
    icon: string;
  }
> = {
  "net-worth": {
    tone: "brand",
    icon: "bg-primary/10 text-primary ring-primary/15",
  },
  "total-income": {
    tone: "positive",
    icon: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400",
  },
  "total-expense": {
    tone: "negative",
    icon: "bg-rose-500/10 text-rose-600 ring-rose-500/15 dark:text-rose-400",
  },
  "net-savings": {
    tone: "positive",
    icon: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400",
  },
  "cash-in-hand": {
    tone: "neutral",
    icon: "bg-muted text-muted-foreground ring-border/60",
  },
  "bank-balance": {
    tone: "neutral",
    icon: "bg-muted text-muted-foreground ring-border/60",
  },
  "investment-value": {
    tone: "neutral",
    icon: "bg-muted text-muted-foreground ring-border/60",
  },
  "monthly-balance": {
    tone: "brand",
    icon: "bg-primary/10 text-primary ring-primary/15",
  },
};
