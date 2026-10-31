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
  const [isOnline, setIsOnline] = useState(true);
  const [noInternetDismissed, setNoInternetDismissed] = useState(false);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
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

  // A banner should render only while the browser has no internet and the
  // person has not dismissed it. Nothing in the website reads this yet.
  const showNoInternetBanner = !isOnline && !noInternetDismissed;

  return {
    isOnline,
    noInternetDismissed,
    setNoInternetDismissed,
    showNoInternetBanner,
    syncError: transactionsError,
    lastSyncedAt,
    lastSyncedLabel,
  };
}