"use client";

import {
  ChartPie,
  LineChart,
  Settings2,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { AiCoachDrawer } from "@/components/dashboard/AiCoachDrawer";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { DashboardDateFilter } from "@/components/dashboard/DashboardDateFilter";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { DashboardRecentTransactions } from "@/components/dashboard/DashboardRecentTransactions";
import { QuickActionsMenu } from "@/components/dashboard/QuickActionsMenu";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { AddInvestmentSlideOver } from "@/components/shared/AddInvestmentSlideOver";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useInvestmentEntry } from "@/hooks/useInvestmentEntry";
import { useInvestments } from "@/hooks/useInvestments";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useTransactions } from "@/hooks/useTransactions";
import { filterAnalyticsTransactions } from "@/lib/analytics";
import { buildMultiPurposeTrend, getDashboardPeriodLabel } from "@/lib/dashboard";
import { getTimeAwareGreeting } from "@/lib/greeting";
import { getCurrentPlanMonth } from "@/lib/plan";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import { useViewerAccess } from "@/providers/viewer-provider";
import { useToast } from "@/providers/toast-provider";
import type { AnalyticsFilters, DashboardDatePreset, Transaction } from "@/types";

function DashboardSection({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartPanel({
  title,
  description,
  icon: Icon,
  isLoading,
  hasData,
  emptyMessage,
  accent = "emerald",
  children,
}: {
  title: string;
  description: string;
  icon: typeof LineChart;
  isLoading: boolean;
  hasData: boolean;
  emptyMessage: string;
  accent?: "emerald" | "rose";
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center gap-3 border-b border-border/70 pb-4">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            accent === "emerald"
              ? "bg-primary/10 text-primary ring-primary/15"
              : "bg-muted text-muted-foreground ring-border/60",
          )}
        >
          <Icon className="size-4.5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div>
        {isLoading ? (
          <Skeleton className="h-64 rounded-lg" aria-label="Loading chart..." />
        ) : hasData ? (
          children
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
            <div className="mb-1 flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-5" strokeWidth={2} />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}



export function DashboardPage() {
  const router = useRouter();
  const { data, error, isLoading } = useDashboardData();
  const { user } = useAuthReady();
  const { purposes } = usePurposes();
  const { accounts } = useAccounts();
  const { investments } = useInvestments();
  const {
    addTransaction,
    transactions,
    isLoading: transactionsLoading,
  } = useTransactions();
  const { filters, updateFilter } = useGlobalFilters();
  const { isReadOnlyViewer } = useViewerAccess();
  const { isOffline, lastSyncedLabel } = useSyncStatus();

  const [slideOverMode, setSlideOverMode] = useState<Transaction["type"]>("expense");
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [investmentSlideOverOpen, setInvestmentSlideOverOpen] = useState(false);
  const [kpiConfigOpen, setKpiConfigOpen] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const { notify } = useToast();
  const { saveInvestmentEntry } = useInvestmentEntry();

  const planMonth = filters.dashboardMonth || getCurrentPlanMonth();
  const { data: plan } = useMonthlyPlanQuery(planMonth, PERSONAL_PURPOSE_ID);

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = getTimeAwareGreeting(user?.name ?? "Member");
  const periodLabel = getDashboardPeriodLabel(filters.dashboardDatePreset);

  const investmentsTotal = useMemo(
    () => investments.reduce((sum, item) => sum + item.currentValue, 0),
    [investments],
  );

  function handleDatePresetChange(
    preset: DashboardDatePreset,
    range: { dateFrom: string; dateTo: string },
  ) {
    updateFilter("dashboardDatePreset", preset);
    updateFilter("dateFrom", range.dateFrom);
    updateFilter("dateTo", range.dateTo);
    if (preset === "this-month") {
      updateFilter("dashboardMonth", getCurrentPlanMonth());
    } else if (preset === "last-month") {
      updateFilter("dashboardMonth", range.dateFrom.slice(0, 7));
    }
  }

  function handleSpecificMonthChange(
    month: string,
    range: { dateFrom: string; dateTo: string },
  ) {
    updateFilter("specificMonth", month);
    updateFilter("dashboardDatePreset", "specific-month");
    updateFilter("dateFrom", range.dateFrom);
    updateFilter("dateTo", range.dateTo);
    updateFilter("dashboardMonth", month);
  }

  const filteredTransactions = useMemo(() => {
    const analyticsFilters: AnalyticsFilters = {
      ...filters,
      purpose: filters.purposeId,
      merchant: "",
      transactionStatus: "",
      tags: [],
      categoryGroup: "",
      sortBy: "newest",
      datePreset: "custom",
      compareMode: "",
      outingType: "",
      outingWithWhom: "",
      outingStatus: "",
      trendGranularity: "daily",
    };
    const processed = transactions.filter(
      (transaction) =>
        !(transaction.category === "Settlements" && transaction.type === "income"),
    );
    return filterAnalyticsTransactions(processed, analyticsFilters);
  }, [filters, transactions]);

  const trend = useMemo(
    () =>
      buildMultiPurposeTrend(
        filteredTransactions,
        purposes,
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
        filters.purposeId,
      ),
    [filteredTransactions, filters.dateFrom, filters.dateTo, filters.purposeId, purposes],
  );

  const recentTransactions = useMemo(
    () =>
      [...filteredTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10),
    [filteredTransactions],
  );

  async function handleAdd(values: Omit<Transaction, "id">) {
    await addTransaction(values);
    notify({ title: "Transaction saved." });
  }

  async function handleAddInvestment(
    values: Parameters<typeof saveInvestmentEntry>[0],
  ) {
    const { investment } = await saveInvestmentEntry(values);
    notify({
      title: "Investment added",
      description: `${investment.name} was saved and added to your wealth portfolio.`,
    });
  }

  if (error) {
    const isPermissionError = error.message.includes(
      "Missing or insufficient permissions",
    );
    const isIndexError = error.message.includes("requires an index");

    return (
      <div className="premium-surface animate-in fade-in slide-in-from-bottom-2 border-destructive/40 bg-destructive/[0.06] p-6 text-sm text-destructive duration-500">
        <p className="font-semibold">
          Something went wrong. We couldn&apos;t load your data. Try refreshing the page.
        </p>
        <p className="mt-2 text-xs opacity-90">{error.message}</p>
        {isIndexError ? (
          <p className="mt-3 text-xs text-destructive/90">
            Create the Firestore composite index for{" "}
            <code className="font-mono">transactions</code>: fields{" "}
            <code className="font-mono">userId</code> (Ascending) +{" "}
            <code className="font-mono">date</code> (Descending).
          </p>
        ) : null}
        {isPermissionError ? (
          <p className="mt-3 text-xs text-destructive/90">
            Deploy the root <code className="font-mono">transactions</code> rules
            from <code className="font-mono">firestore.rules</code> in the Firebase
            Console.
          </p>
        ) : null}
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="grid gap-6 pb-24">
      {/* Page header */}
      <header className="flex flex-col gap-5 border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {isOffline ? (
                <>
                  <WifiOff className="size-3 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-400">Offline</span>
                </>
              ) : (
                <>
                  <span className="inline-flex size-1.5 rounded-full bg-emerald-500" />
                  Synced {lastSyncedLabel}
                </>
              )}
              <span className="text-border">·</span>
              {periodLabel}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              {greeting.replace(/\.$/, "")}
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Here&apos;s your financial overview, {firstName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start">
            <DashboardDateFilter
              preset={filters.dashboardDatePreset}
              specificMonth={filters.specificMonth}
              onPresetChange={handleDatePresetChange}
              onSpecificMonthChange={handleSpecificMonthChange}
            />

            {!isReadOnlyViewer ? (
              <QuickActionsMenu
                onAddExpense={() => {
                  setSlideOverMode("expense");
                  setSlideOverOpen(true);
                }}
                onAddIncome={() => {
                  setSlideOverMode("income");
                  setSlideOverOpen(true);
                }}
                onMonthlyPlan={() => router.push("/plan")}
                onStartOuting={() => router.push("/outings")}
              />
            ) : null}
          </div>
        </div>

        <PurposeFilterChips
          value={filters.purposeId}
          onChange={(purposeId) => updateFilter("purposeId", purposeId)}
        />
      </header>

      <div>
        <DashboardSection
          eyebrow="Summary"
          title="Overview"
          action={
            <div className="flex items-center gap-2.5 sm:gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pr-3 pl-1.5">
                <Switch
                  id="comparison-mode"
                  checked={showComparison}
                  onCheckedChange={setShowComparison}
                />
                <Label
                  htmlFor="comparison-mode"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Compare
                </Label>
              </div>
              <Button
                className="hidden gap-1.5 rounded-lg sm:inline-flex"
                variant="outline"
                onClick={() => setKpiConfigOpen(true)}
              >
                <Settings2 className="size-3.5" />
                Customise
              </Button>
            </div>
          }
        >
          <DashboardKpiRow
            accounts={accounts}
            investmentsTotal={investmentsTotal}
            isLoading={isLoading}
            kpis={kpis ?? null}
            configOpen={kpiConfigOpen}
            showComparison={showComparison}
            onConfigOpenChange={setKpiConfigOpen}
            periodLabel={periodLabel.toLowerCase()}
            purposes={purposes}
            transactions={transactions}
          />
        </DashboardSection>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-6 lg:col-span-2">
          <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  Cash Flow Trend
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Money in vs out across the selected period.
                </p>
              </div>
            </div>

            {isLoading || !data ? (
              <Skeleton className="mt-5 h-72 rounded-xl" aria-label="Loading chart..." />
            ) : trend.data.length > 0 ? (
              <>
                <div className="mt-5">
                  <p className="text-[30px] font-bold leading-none tracking-tight tabular-nums">
                    {formatCurrency(kpis?.savings ?? 0)}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        (kpis?.savings ?? 0) >= 0
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
                      )}
                    >
                      {kpis?.savingsRate ?? 0}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      savings rate · net flow this period
                    </span>
                  </div>
                </div>
                <div className="mt-6">
                  <TrendChart data={trend.data} series={trend.series} />
                </div>
              </>
            ) : (
              <div className="mt-5 flex h-64 flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 px-6 text-center">
                <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <LineChart className="size-5" strokeWidth={2} />
                </div>
                <p className="max-w-xs text-sm text-muted-foreground">
                  No transactions in this period. Add your first transaction to see
                  trends.
                </p>
              </div>
            )}
          </div>

          <DashboardRecentTransactions
            isLoading={transactionsLoading}
            isReadOnly={isReadOnlyViewer}
            purposes={purposes}
            transactions={recentTransactions}
            onAddTransaction={() => {
              setSlideOverMode("expense");
              setSlideOverOpen(true);
            }}
          />
        </div>

        <div className="grid gap-6 lg:col-span-1">
          <ChartPanel
            accent="rose"
            description="Highest spending areas in this period."
            emptyMessage="No expense data for this period."
            hasData={Boolean(data && data.topCategories.length > 0)}
            icon={ChartPie}
            isLoading={isLoading || !data}
            title="Top Categories"
          >
            <CategoryChart data={data?.topCategories ?? []} />
          </ChartPanel>
        </div>
      </div>

      {!isReadOnlyViewer ? (
        <>
          <AddTransactionSlideOver
            mode={slideOverMode}
            open={slideOverOpen}
            onInvestmentCategorySelected={() => setInvestmentSlideOverOpen(true)}
            onOpenChange={setSlideOverOpen}
            onSubmit={handleAdd}
          />
          <AddInvestmentSlideOver
            open={investmentSlideOverOpen}
            onOpenChange={setInvestmentSlideOverOpen}
            onSubmit={handleAddInvestment}
          />
          <AiCoachDrawer plan={plan} transactions={transactions} />
        </>
      ) : null}
    </div>
  );
}
