"use client";

import {
  ChartPie,
  Compass,
  Info,
  LineChart,
  Plus,
  Settings2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserSettings } from "@/hooks/useUserSettings";
import { saveUserSettings, fetchOnboardingState, fetchUserProfile } from "@/lib/supabase-data";
import { queryKeys } from "@/lib/query-keys";
import { AiCoachDrawer } from "@/components/dashboard/AiCoachDrawer";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { DashboardDateFilter } from "@/components/dashboard/DashboardDateFilter";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { DashboardRecentTransactions } from "@/components/dashboard/DashboardRecentTransactions";
import { FirstRunOnboardingModal } from "@/components/onboarding/FirstRunOnboardingModal";
import { QuickActionsMenu } from "@/components/dashboard/QuickActionsMenu";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
import { PurposeFilterChips } from "@/components/shared/PurposeFilterChips";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/hooks/useAccounts";
import { useAllOutingExpenses } from "@/hooks/useAllOutingExpenses";
import { useOutings } from "@/hooks/useOutings";
import { formatOutingDates, isOutingActive } from "@/lib/outing-display";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useInvestmentTotal } from "@/hooks/useInvestmentTotal";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";
import { filterAnalyticsTransactions } from "@/lib/analytics";
import { buildMultiPurposeTrend, getDashboardPeriodLabel } from "@/lib/dashboard";
import { getTimeAwareGreeting } from "@/lib/greeting";
import { buildTransactionsListRows } from "@/lib/outings";
import { getDateRangeForDashboardPreset } from "@/lib/date-filters";
import { getCurrentPlanMonth } from "@/lib/plan";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cn, compareTransactionsNewestFirst, formatCurrency } from "@/lib/utils";
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
  className,
  children,
}: {
  title: string;
  description: string;
  icon: typeof LineChart;
  isLoading: boolean;
  hasData: boolean;
  emptyMessage: string;
  accent?: "emerald" | "rose";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("sx-surface flex h-full min-h-0 flex-col p-6", className)}>
      <div className="mb-4 flex shrink-0 items-center gap-3 border-b border-border/40 pb-3.5">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
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

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <Skeleton className="h-full min-h-64 rounded-lg" aria-label="Loading chart..." />
        ) : hasData ? (
          <div className="min-h-0 flex-1">{children}</div>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
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
  const queryClient = useQueryClient();
  const { settings } = useUserSettings();
  const { data, error, isLoading, unlinkedOutingExpenses, netWorthTransactions } =
    useDashboardData();
  const { user, authUser } = useAuthReady();
  const { purposes } = usePurposes();
  const { accounts } = useAccounts();
  const { totalInvested } = useInvestmentTotal();
  const {
    addTransaction,
    transactions,
    isLoading: transactionsLoading,
  } = useTransactions();
  const { expenses: allOutingExpenses } = useAllOutingExpenses();
  const { outings } = useOutings();
  const activeOuting = useMemo(
    () => outings.find((o) => isOutingActive(o) && o.isActive !== false),
    [outings],
  );
  const { filters, updateFilter } = useGlobalFilters();
  const { isReadOnlyViewer } = useViewerAccess();

  const [slideOverMode, setSlideOverMode] = useState<Transaction["type"]>("expense");
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [activeOutingExpenseOpen, setActiveOutingExpenseOpen] = useState(false);
  const [kpiConfigOpen, setKpiConfigOpen] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const { notify } = useToast();

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile-joined", user?.id],
    queryFn: () => fetchUserProfile(user?.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  const currentMonth = getCurrentPlanMonth();

  const accountCreatedMonth = useMemo(() => {
    const rawDate = userProfile?.joinedAt ?? user?.createdAt ?? authUser?.created_at;
    if (!rawDate) return currentMonth;
    const match = rawDate.match(/^(\d{4})-(\d{2})/);
    const parsed = match ? `${match[1]}-${match[2]}` : currentMonth;
    return parsed > currentMonth ? currentMonth : parsed;
  }, [userProfile?.joinedAt, user?.createdAt, authUser?.created_at, currentMonth]);

  const planMonth = filters.dashboardMonth || currentMonth;
  const { data: plan } = useMonthlyPlanQuery(planMonth, PERSONAL_PURPOSE_ID);
  const onboardingQuery = useQuery({
    queryKey: ["onboarding", user?.id],
    queryFn: () => fetchOnboardingState(user?.id),
    enabled: Boolean(user?.id),
  });

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = getTimeAwareGreeting(user?.name ?? "Member");
  const periodLabel = getDashboardPeriodLabel(filters.dashboardDatePreset);

  function handleDatePresetChange(
    preset: DashboardDatePreset,
    range: { dateFrom: string; dateTo: string },
  ) {
    updateFilter("dashboardDatePreset", preset);
    updateFilter("dateFrom", range.dateFrom);
    updateFilter("dateTo", range.dateTo);
    if (preset === "this-month") {
      updateFilter("dashboardMonth", currentMonth);
    } else if (preset === "last-month") {
      updateFilter("dashboardMonth", range.dateFrom.slice(0, 7));
    }
  }

  function handleSpecificMonthChange(
    month: string,
    range: { dateFrom: string; dateTo: string },
  ) {
    let target = month;
    if (accountCreatedMonth && target < accountCreatedMonth) target = accountCreatedMonth;
    if (currentMonth && target > currentMonth) target = currentMonth;

    const effectiveRange =
      target !== month
        ? getDateRangeForDashboardPreset("specific-month", target)
        : range;

    updateFilter("specificMonth", target);
    updateFilter("dashboardDatePreset", "specific-month");
    updateFilter("dateFrom", effectiveRange.dateFrom);
    updateFilter("dateTo", effectiveRange.dateTo);
    updateFilter("dashboardMonth", target);
  }

  // Auto-correct any preset or month that lies outside [accountCreatedMonth, currentMonth]
  useEffect(() => {
    if (!accountCreatedMonth) return;
    const [yearStr, mStr] = currentMonth.split("-");
    const year = parseInt(yearStr, 10);
    const m = parseInt(mStr, 10);
    const prevMonth = m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;

    if (filters.dashboardDatePreset === "last-month" && accountCreatedMonth > prevMonth) {
      handleDatePresetChange(
        "this-month",
        getDateRangeForDashboardPreset("this-month"),
      );
    } else if (filters.dashboardDatePreset === "specific-month") {
      if (filters.specificMonth && filters.specificMonth < accountCreatedMonth) {
        handleSpecificMonthChange(
          accountCreatedMonth,
          getDateRangeForDashboardPreset("specific-month", accountCreatedMonth),
        );
      } else if (filters.specificMonth && filters.specificMonth > currentMonth) {
        handleSpecificMonthChange(
          currentMonth,
          getDateRangeForDashboardPreset("specific-month", currentMonth),
        );
      }
    }
  }, [accountCreatedMonth, currentMonth, filters.dashboardDatePreset, filters.specificMonth]);

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
    return filterAnalyticsTransactions(processed, analyticsFilters, { purposes });
  }, [filters, transactions, purposes]);

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

  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);

  const activeTrendSeries = useMemo(
    () => trend.series.find((s) => s.key === selectedTrendKey),
    [trend.series, selectedTrendKey],
  );

  const selectedTrendTotal = useMemo(() => {
    if (!selectedTrendKey) return 0;
    return trend.data.reduce(
      (sum, row) => sum + (Number(row[selectedTrendKey]) || 0),
      0,
    );
  }, [trend.data, selectedTrendKey]);

  useEffect(() => {
    if (selectedTrendKey && !trend.series.some((s) => s.key === selectedTrendKey)) {
      setSelectedTrendKey(null);
    }
  }, [trend.series, selectedTrendKey]);

  // Match Transactions list: normal spends + one outing total line per trip
  // with live expense totals (not a stale stored rollup amount).
  const recentTransactions = useMemo(
    () =>
      buildTransactionsListRows(filteredTransactions, allOutingExpenses, outings)
        .sort(compareTransactionsNewestFirst)
        .slice(0, 10),
    [allOutingExpenses, filteredTransactions, outings],
  );

  async function handleAdd(values: Omit<Transaction, "id">) {
    try {
      await addTransaction(values);
      setSlideOverOpen(false);
      notify({ title: "Transaction saved." });
    } catch (err) {
      notify({
        title: "Couldn't save transaction",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      throw err;
    }
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
            Check Postgres indexes on{" "}
            <code className="font-mono">transactions</code> for{" "}
            <code className="font-mono">user_id</code> +{" "}
            <code className="font-mono">transaction_date</code>.
          </p>
        ) : null}
        {isPermissionError ? (
          <p className="mt-3 text-xs text-destructive/90">
            Verify Supabase RLS policies allow read access to{" "}
            <code className="font-mono">transactions</code> for the signed-in user.
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
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              {greeting.replace(/\.$/, "")} 👋
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Here&apos;s your financial overview, {firstName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start">
            <DashboardDateFilter
              preset={filters.dashboardDatePreset}
              specificMonth={filters.specificMonth}
              minMonth={accountCreatedMonth}
              maxMonth={currentMonth}
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

        {
          !isReadOnlyViewer &&   <PurposeFilterChips
          value={filters.purposeId}
          onChange={(purposeId) => updateFilter("purposeId", purposeId)}/>
        }
      </header>

      {activeOuting ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Compass className="size-3.5" />
              Active Outing
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Active
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold">{activeOuting.name}</h3>
            <p className="text-xs text-muted-foreground">{formatOutingDates(activeOuting)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              className="gap-1.5"
              onClick={() => setActiveOutingExpenseOpen(true)}
            >
              <Plus className="size-4" />
              Add Outing Expense
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/outings/${activeOuting.id}`)}
            >
              Manage Outing
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
            <Info className="size-3.5 shrink-0 text-muted-foreground" />
            <span>Only one active outing is allowed at a time.</span>
          </p>
        </div>
      ) : null}

      {!isReadOnlyViewer ? (
        <FirstRunOnboardingModal
          // The "is this a fresh workspace?" decision lives server-side in
          // fetchOnboardingState so it travels with the account across
          // browsers/devices. Client-side account shape checks used to be
          // layered on top here, but they were written against a one-account
          // seed and silently blocked the modal once handle_new_user started
          // seeding both Cash and Account 1.
          open={!onboardingQuery.isLoading && (onboardingQuery.data?.needsOnboarding ?? false)}
        />
      ) : null}

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
              {!isReadOnlyViewer ? (
                <Button
                  className="hidden gap-1.5 rounded-lg sm:inline-flex"
                  variant="outline"
                  onClick={() => setKpiConfigOpen(true)}
                >
                  <Settings2 className="size-3.5" />
                  Customise
                </Button>
              ) : null}
            </div>
          }
        >
          <DashboardKpiRow
            isReadOnlyViewer={isReadOnlyViewer}
            accounts={accounts}
            investmentsTotal={totalInvested}
            isLoading={isLoading}
            kpis={kpis ?? null}
            configOpen={kpiConfigOpen}
            showComparison={showComparison}
            onConfigOpenChange={setKpiConfigOpen}
            periodLabel={periodLabel.toLowerCase()}
            purposes={purposes}
            transactions={transactions}
            balanceTransactions={netWorthTransactions}
            unlinkedOutingExpenses={unlinkedOutingExpenses}
          />
        </DashboardSection>
      </div>

      {/* Cash Flow + Top Categories share one row so heights match on desktop. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <div className="sx-surface flex h-full min-h-0 flex-col p-6 lg:col-span-2">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
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
              <div className="mt-5 shrink-0">
                <p className="text-[30px] font-bold leading-none tracking-tight tabular-nums">
                  {formatCurrency(
                    activeTrendSeries ? selectedTrendTotal : (kpis?.savings ?? 0),
                  )}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {activeTrendSeries ? (
                    <>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${activeTrendSeries.color}20`,
                          color: activeTrendSeries.color,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: activeTrendSeries.color }}
                        />
                        {activeTrendSeries.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        total {activeTrendSeries.type} this period · click button again to show all
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          (kpis?.savings ?? 0) >= 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
                        )}
                      >
                        {kpis?.savingsRate ?? 0}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        savings rate · net flow this period
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-6 min-h-0 flex-1">
                <TrendChart
                  data={trend.data}
                  series={trend.series}
                  selectedKey={selectedTrendKey}
                  onSelectKey={setSelectedTrendKey}
                />
              </div>
            </>
          ) : (
            <div className="mt-5 flex h-64 flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 px-6 text-center">
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

        <ChartPanel
          accent="rose"
          className="lg:col-span-1"
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

      {!isReadOnlyViewer ? (
        <>
          <AddTransactionSlideOver
            mode={slideOverMode}
            open={slideOverOpen}
            onOpenChange={setSlideOverOpen}
            onSubmit={handleAdd}
          />
          {activeOuting ? (
            <AddTransactionSlideOver
              lockedOutingId={activeOuting.id}
              open={activeOutingExpenseOpen}
              onOpenChange={setActiveOutingExpenseOpen}
            />
          ) : null}
          <AiCoachDrawer plan={plan} transactions={transactions} />
        </>
      ) : null}
    </div>
  );
}
