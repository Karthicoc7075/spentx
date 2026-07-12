"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/providers/app-data-provider";

function formatRelativeTime(date: Date | null) {
  if (!date) return "Never";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function useSyncStatus() {
  const { transactionsError, lastSyncedAt } = useAppData();
  const [isOffline, setIsOffline] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const lastSyncedLabel = useMemo(
    () => formatRelativeTime(lastSyncedAt),
    [lastSyncedAt],
  );

  return {
    isOffline,
    offlineDismissed,
    setOfflineDismissed,
    syncError: transactionsError,
    lastSyncedAt,
    lastSyncedLabel,
  };
}