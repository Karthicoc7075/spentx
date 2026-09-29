"use client";

import { useMemo, useState } from "react";
import { AnimatedCurrency } from "@/components/shared/AnimatedCurrency";
import { KpiConfigModal } from "@/components/dashboard/KpiConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DashboardKpiKey,
  useDashboardKpiConfig,
} from "@/hooks/useDashboardKpiConfig";
import {
  computeNetWorthByPurpose,
  getAccountBalance,
} from "@/lib/wealth";
import { kpiIcons } from "@/lib/dashboard-kpi-meta";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  Account,
  KpiData,
  KpiDelta,
  OutingExpense,
  Purpose,
  Transaction,
} from "@/types";

type DashboardKpiRowProps = {
  readonly isReadOnlyViewer: boolean;
  kpis: KpiData | null;
  accounts: Account[];
  /** Full, unfiltered-by-active-filter ledger — the "Per Purpose" Net Worth
   * breakdown needs every purpose's own data, not just the currently
   * selected one. */
  transactions: Transaction[];
  /** Purpose/Category-narrowed (but date-unrestricted) ledger — same set
   * the Net Worth KPI is built from. Used for Cash in Hand / Bank Balance
   * so those cards agree with Net Worth under the active filter. Falls
   * back to `transactions` when omitted. */
  balanceTransactions?: Transaction[];
  purposes: Purpose[];
  investmentsTotal: number;
  periodLabel: string;
  isLoading?: boolean;
  /** Personal share is still resolving opening balances for this card only. */
  netWorthLoading?: boolean;
  configOpen?: boolean;
  showComparison?: boolean;
  onConfigOpenChange?: (open: boolean) => void;
  unlinkedOutingExpenses?: OutingExpense[];
};

function shortDelta(delta: KpiDelta) {
  if (delta.percent != null && delta.percent !== 0) {
    return `${delta.percent > 0 ? "+" : ""}${delta.percent.toFixed(0)}%`;
  }
  if (delta.amount != null && delta.amount !== 0) {
    return `${delta.amount > 0 ? "+" : ""}${formatCurrency(delta.amount)}`;
  }
  return "0%";
}

function isDeltaPositive(delta: KpiDelta) {
  if (delta.percent != null) return delta.percent >= 0;
  if (delta.amount != null) return delta.amount >= 0;
  return true;
}

function DeltaPill({
  delta,
  periodLabel,
  invert = false,
}: {
  delta: KpiDelta;
  periodLabel: string;
  invert?: boolean;
}) {
  const positive = isDeltaPositive(delta);
  const good = invert ? !positive : positive;

  return (
    <>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          good
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
        )}
      >
        {shortDelta(delta)}
      </span>
      <span className="text-xs text-muted-foreground">vs {periodLabel}</span>
    </>
  );
}

export function DashboardKpiRow({
  isReadOnlyViewer,
  kpis,
  accounts,
  transactions,
  balanceTransactions,
  purposes,
  investmentsTotal,
  periodLabel,
  isLoading,
  netWorthLoading = false,
  configOpen = false,
  showComparison = true,
  onConfigOpenChange,
  unlinkedOutingExpenses = [],
}: DashboardKpiRowProps) {
  const balanceLedger = balanceTransactions ?? transactions;
  const { activeKeys, setActiveKeys, resetToDefault } = useDashboardKpiConfig();
  const [netWorthView, setNetWorthView] = useState<"combined" | "per-purpose">(
    "combined",
  );

  const perPurposeNetWorth = useMemo(
    () =>
      computeNetWorthByPurpose(
        accounts,
        transactions,
        purposes,
        unlinkedOutingExpenses,
      ),
    [accounts, purposes, transactions, unlinkedOutingExpenses],
  );

  const cashBalance = useMemo(
    () =>
      accounts
        .filter((account) => account.type === "cash" && account.isActive !== false)
        .reduce(
          (sum, account) =>
            sum +
            getAccountBalance(account, balanceLedger, unlinkedOutingExpenses),
          0,
        ),
    [accounts, balanceLedger, unlinkedOutingExpenses],
  );

  const bankBalance = useMemo(
    () =>
      accounts
        .filter((account) => account.type === "bank" && account.isActive !== false)
        .reduce(
          (sum, account) =>
            sum +
            getAccountBalance(account, balanceLedger, unlinkedOutingExpenses),
          0,
        ),
    [accounts, balanceLedger, unlinkedOutingExpenses],
  );

  function renderCard(key: DashboardKpiKey, index: number) {
    if (!kpis) return null;

    const Icon = kpiIcons[key];
    const cardStyle = {
      animationDelay: `${index * 60}ms`,
      animationFillMode: "backwards" as const,
    };

    if (key === "net-worth") {
      if (netWorthLoading) {
        return <Skeleton key={key} className="h-[132px] rounded-2xl" />;
      }
      const netWorthTitle = isReadOnlyViewer
        ? `${purposes[0]?.name ? `${purposes[0].name} Net Worth` : "Purpose Net Worth"}`
        : "Net Worth";

      return (
        <div
          key={key}
          className="sx-surface-interactive group relative flex flex-col justify-between p-5"
          style={cardStyle}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {netWorthTitle}
            </span>
            {
              !isReadOnlyViewer && (<div className="inline-flex rounded-lg bg-muted p-0.5 text-[10px] ring-1 ring-inset ring-border">
              <button
                className={cn(
                  "rounded-[6px] px-2 py-1 font-medium transition-colors",
                  netWorthView === "combined"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
                onClick={() => setNetWorthView("combined")}
              >
                Combined
              </button>
              <button
                className={cn(
                  "rounded-[6px] px-2 py-1 font-medium transition-colors",
                  netWorthView === "per-purpose"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
                onClick={() => setNetWorthView("per-purpose")}
              >
                Per Purpose
              </button>
            </div>)
            }
          </div>

          {netWorthView === "combined" ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[30px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                <AnimatedCurrency value={kpis.netWorth} />
              </p>
              <div className="flex min-h-[22px] items-center gap-2">
                {showComparison && (
                  <DeltaPill delta={kpis.netWorthDelta} periodLabel={periodLabel} />
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-1.5">
              {perPurposeNetWorth.map((item) => (
                <div
                  key={item.purposeId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-foreground">{item.purposeName}</span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(item.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const cardConfig: Record<
      Exclude<DashboardKpiKey, "net-worth">,
      {
        label: string;
        value: number;
        delta?: KpiDelta;
        invert?: boolean;
        meta?: string;
      }
    > = {
      "total-income": {
        label: "Period Inflow",
        value: kpis.income,
        delta: kpis.incomeDelta,
        meta: "Inflow reserves",
      },
      "total-expense": {
        label: "Period Outflow",
        value: kpis.expense,
        delta: kpis.expenseDelta,
        invert: true,
        meta: "Total outflow",
      },
      "net-savings": {
        label: "Period Savings",
        value: kpis.savings,
        meta: `Savings rate ${kpis.savingsRate}% yield`,
      },
      "cash-in-hand": {
        label: "Cash in Hand",
        value: cashBalance,
        meta: "Across all cash accounts",
      },
      "bank-balance": {
        label: "Bank Balance",
        value: bankBalance,
        meta: "Across all bank accounts",
      },
      "investment-value": {
        label: "Investment Value",
        value: investmentsTotal,
        meta: "Not included in net worth",
      },
      "outing-spend": {
        label: "Outings Spend",
        value: kpis.outingExpense ?? 0,
        meta: "Vacations & group trips",
      },
      "month-rollover": {
        label: "Last Month Rollover",
        value: kpis.previousMonthRollover ?? 0,
        meta:
          (kpis.previousMonthRollover ?? 0) >= 0
            ? "Surplus carried forward"
            : "Deficit carried forward",
      },
    };

    const config = cardConfig[key];

    return (
      <div
        key={key}
        className="sx-surface-interactive group relative flex flex-col justify-between p-5"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {config.label}
          </span>
          <Icon className="size-4 text-muted-foreground/50" strokeWidth={2} />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[30px] font-bold leading-none tracking-tight tabular-nums text-foreground">
            <AnimatedCurrency value={config.value} />
          </p>

          <div className="flex min-h-[22px] flex-wrap items-center gap-2">
            {key === "month-rollover" ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  (kpis.previousMonthRollover ?? 0) >= 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
                )}
              >
                {(kpis.previousMonthRollover ?? 0) >= 0 ? "Surplus" : "Deficit"}
              </span>
            ) : null}
            {key === "outing-spend" && kpis.expense > 0 && (kpis.outingExpense ?? 0) > 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {Math.round(((kpis.outingExpense ?? 0) / kpis.expense) * 100)}% of spend
              </span>
            ) : null}
            {showComparison && config.delta ? (
              <DeltaPill
                delta={config.delta}
                invert={config.invert}
                periodLabel={periodLabel}
              />
            ) : config.meta ? (
              <span className="text-xs text-muted-foreground">{config.meta}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const effectiveActiveKeys = useMemo<DashboardKpiKey[]>(() => {
    if (isReadOnlyViewer) {
      return activeKeys.map((k) => (k === "net-savings" ? "month-rollover" : k));
    }
    return activeKeys;
  }, [isReadOnlyViewer, activeKeys]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !kpis
          ? effectiveActiveKeys.map((key) => (
              <Skeleton key={key} className="h-[132px] rounded-2xl" />
            ))
          : effectiveActiveKeys.map((key, index) => renderCard(key, index))}
      </div>

      <KpiConfigModal
        activeKeys={activeKeys}
        open={configOpen}
        onChange={setActiveKeys}
        onOpenChange={(open) => onConfigOpenChange?.(open)}
        onReset={resetToDefault}
      />
    </>
  );
}
