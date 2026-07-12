"use client";

import { useMemo } from "react";
import { calculateDailySafeSpending } from "@/lib/calculators/dailyLimit";
import { getCurrentPlanMonth, sumPlanned } from "@/lib/plan";
import { PERSONAL_PURPOSE_ID, transactionMatchesPurpose } from "@/lib/purposes";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { usePurposes } from "@/hooks/usePurposes";
import { useTransactions } from "@/hooks/useTransactions";

type UseDailySafeSpendingOptions = {
  month?: string;
  plannedTotal?: number;
  purposeId?: string;
};

export function useDailySafeSpending(options: UseDailySafeSpendingOptions = {}) {
  const { transactions: allTransactions } = useTransactions();
  const { purposes } = usePurposes();
  const { filters } = useGlobalFilters();
  const month = options.month ?? filters.dashboardMonth ?? getCurrentPlanMonth();
  const purposeId = options.purposeId ?? PERSONAL_PURPOSE_ID;
  const planQuery = useMonthlyPlanQuery(month, purposeId);

  const transactions = useMemo(
    () =>
      allTransactions.filter((transaction) =>
        transactionMatchesPurpose(transaction.purpose, purposeId, purposes),
      ),
    [allTransactions, purposeId, purposes],
  );

  const plannedTotal =
    options.plannedTotal ??
    (planQuery.data ? sumPlanned(planQuery.data.allocations) : 0);

  const result = useMemo(
    () =>
      calculateDailySafeSpending({
        plannedTotal,
        transactions,
        month,
      }),
    [month, plannedTotal, transactions],
  );

  return result;
}