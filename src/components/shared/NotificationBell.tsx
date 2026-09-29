"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { AlertItem } from "@/components/shared/AlertItem";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useSmartAlerts } from "@/hooks/useSmartAlerts";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useToast } from "@/providers/toast-provider";

export function NotificationBell() {
  const { alerts, unreadCount, readAlert, readAllAlerts } = useSmartAlerts();
  const { settings } = useUserSettings();
  const { user } = useAuthReady();
  const { notify } = useToast();
  const preview = alerts.slice(0, 4);

  // FIRESTORE_REBUILD_SPEC Step 8.4 — the Notifications toggle controls only
  // the badge + toast surface. Alerts still generate and remain visible on
  // /alerts regardless; when OFF we simply hide the unread badge and suppress
  // the "new alert" toast.
  const notificationsOn = settings.notifications !== false;
  const badgeCount = notificationsOn ? unreadCount : 0;

  // Track seen toast notification IDs in localStorage so a toast is only displayed ONCE
  // and never repeatedly shown on page refresh or app reopening.
  // The alert remains in the bell menu as unread until the user reads it.
  const storageKey = user?.id ? `spentx:seenToastAlertIds:${user.id}` : null;
  const seenToastIdsRef = useRef<Set<string>>(new Set());
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;

    if (initializedKeyRef.current !== storageKey) {
      initializedKeyRef.current = storageKey;
      let stored: Set<string> = new Set();
      let existsInStorage = false;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          stored = new Set(JSON.parse(raw));
          existsInStorage = true;
        }
      } catch {
        stored = new Set();
      }

      // If first time loading on this device/user, baseline existing alerts to avoid backlog spam
      if (!existsInStorage && alerts.length > 0) {
        alerts.forEach((a) => stored.add(a.id));
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(Array.from(stored)));
        } catch {}
      }

      seenToastIdsRef.current = stored;
      return;
    }

    if (!notificationsOn || alerts.length === 0) return;

    // Only notify alerts that have not yet had a toast popup shown and are unread
    const unnotified = alerts.filter(
      (a) => !seenToastIdsRef.current.has(a.id) && !a.read,
    );

    if (unnotified.length > 0) {
      const topAlert = unnotified[0];
      notify({ title: topAlert.title, description: topAlert.message });

      unnotified.forEach((a) => seenToastIdsRef.current.add(a.id));
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(seenToastIdsRef.current)),
        );
      } catch {}
    }
  }, [alerts, notificationsOn, notify, storageKey]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Notifications"
            className="relative"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Bell className="size-4" />
        {badgeCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between px-2 py-1">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 ? (
            <button
              className="text-xs text-primary hover:underline"
              type="button"
              onClick={() => void readAllAlerts()}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          {preview.length > 0 ? (
            preview.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                compact
                onRead={(id) => void readAlert(id)}
              />
            ))
          ) : (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No alerts right now
            </p>
          )}
        </div>
        <Link className="mt-2 block px-2 py-1 text-center text-xs text-primary hover:underline" href="/alerts">
          View all alerts
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}