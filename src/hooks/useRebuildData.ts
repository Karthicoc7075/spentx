"use client";

/**
 * Read hooks for rebuilt schema tables:
 *   useTransactionSplits, useAuditLog, useShareAccessLogs, useBackupHistory.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  subscribeToTransactionSplits,
  listAuditLogs,
  listShareAccessLogs,
  listBackupHistory,
} from "@/lib/data-rebuild";
import { useAuthReady } from "@/hooks/useAuthReady";
import type {
  AuditLog,
  BackupHistoryEntry,
  ShareAccessLog,
  TransactionSplit,
} from "@/types";

export function useTransactionSplits() {
  const { user, isConfigured, isReady } = useAuthReady();
  const [splits, setSplits] = useState<TransactionSplit[]>([]);

  const ready = (isReady || !isConfigured) && Boolean(user?.id);
  useEffect(() => {
    if (!ready || !user?.id) {
      return () => undefined;
    }
    const unsubscribe = subscribeToTransactionSplits(user.id, setSplits);
    return () => {
      unsubscribe();
      setSplits([]);
    };
  }, [user?.id, ready]);

  return { splits };
}

export function useAuditLog() {
  const { user, isConfigured, isReady } = useAuthReady();
  const query = useQuery({
    queryKey: ["auditLogs", user?.id],
    queryFn: () => listAuditLogs(user!.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });
  return { auditLogs: (query.data ?? []) as AuditLog[], isLoading: query.isPending && !query.data };
}

export function useShareAccessLogs() {
  const { user, isConfigured, isReady } = useAuthReady();
  const query = useQuery({
    queryKey: ["shareAccessLogs", user?.id],
    queryFn: () => listShareAccessLogs(user!.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });
  return {
    shareAccessLogs: (query.data ?? []) as ShareAccessLog[],
    isLoading: query.isPending && !query.data,
  };
}

export function useBackupHistory() {
  const { user, isConfigured, isReady } = useAuthReady();
  const query = useQuery({
    queryKey: ["backupHistory", user?.id],
    queryFn: () => listBackupHistory(user!.id),
    enabled: (isReady || !isConfigured) && Boolean(user?.id),
  });
  return {
    backupHistory: (query.data ?? []) as BackupHistoryEntry[],
    isLoading: query.isPending && !query.data,
    refetch: query.refetch,
  };
}
