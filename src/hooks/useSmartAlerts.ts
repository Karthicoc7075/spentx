"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { generateSmartAlerts, mergeAlerts } from "@/lib/alerts/generateAlerts";
import {
  markAlertRead,
  markAllAlertsRead,
  subscribeToAlerts,
  upsertAlerts,
} from "@/lib/firebase";
import { getCurrentPlanMonth } from "@/lib/plan";
import { queryKeys } from "@/lib/query-keys";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { useReflections } from "@/hooks/useReflections";
import { useTransactions } from "@/hooks/useTransactions";

export function useSmartAlerts() {
  const { user, isConfigured, isReady } = useAuthReady();
  const queryClient = useQueryClient();
  const { transactions } = useTransactions();
  const { reflections } = useReflections();
  const planQuery = useMonthlyPlanQuery(getCurrentPlanMonth());
  const syncedRef = useRef<string>("");

  const query = useQuery({
    queryKey: queryKeys.alerts(user?.id),
    queryFn: async () => [],
    enabled: false,
  });

  useEffect(() => {
    if (isConfigured && !isReady) return;
    if (isConfigured && !user?.id) {
      queryClient.setQueryData(queryKeys.alerts(user?.id), []);
      return;
    }

    const unsubscribe = subscribeToAlerts(
      user?.id,
      (nextAlerts) => {
        queryClient.setQueryData(queryKeys.alerts(user?.id), nextAlerts);
      },
    );

    return unsubscribe;
  }, [isConfigured, isReady, queryClient, user?.id]);

  const generated = useMemo(
    () =>
      generateSmartAlerts({
        transactions,
        monthlyPlan: planQuery.data ?? null,
        reflections,
      }),
    [planQuery.data, reflections, transactions],
  );

  const alerts = useMemo(
    () => mergeAlerts(generated, query.data ?? []),
    [generated, query.data],
  );

  const unreadCount = alerts.filter((alert) => !alert.read).length;
  const highPriorityAlerts = alerts.filter(
    (alert) => alert.severity === "high" && !alert.read,
  );

  useEffect(() => {
    if (!isReady && isConfigured) return;

    const signature = generated.map((alert) => `${alert.id}:${alert.message}`).join("|");
    if (syncedRef.current === signature) return;
    syncedRef.current = signature;

    const merged = mergeAlerts(generated, query.data ?? []);
    void upsertAlerts(user?.id, merged).then((next) => {
      queryClient.setQueryData(queryKeys.alerts(user?.id), next);
    });
  }, [generated, isConfigured, isReady, query.data, queryClient, user?.id]);

  async function readAlert(alertId: string) {
    const next = await markAlertRead(user?.id, alertId);
    queryClient.setQueryData(queryKeys.alerts(user?.id), next);
  }

  async function readAllAlerts() {
    const next = await markAllAlertsRead(user?.id);
    queryClient.setQueryData(queryKeys.alerts(user?.id), next);
  }

  return {
    alerts,
    unreadCount,
    highPriorityAlerts,
    isLoading: isConfigured && isReady && query.data === undefined,
    readAlert,
    readAllAlerts,
  };
}