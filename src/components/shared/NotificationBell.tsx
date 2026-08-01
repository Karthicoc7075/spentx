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

  // Seen alert ids are persisted to localStorage (not just a ref) so a page
  // reload/app relaunch doesn't re-arm alerts the user already saw — an
  // in-memory-only baseline re-toasted every already-seen alert on reload.
  const storageKey = user?.id ? `spentx:seenAlertIds:${user.id}` : null;
  const seenAlertIds = useRef<Set<string> | null>(null);
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedKeyRef.current !== storageKey) {
      hydratedKeyRef.current = storageKey;
      let stored: Set<string> | null = null;
      if (storageKey) {
        try {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) stored = new Set(JSON.parse(raw));
        } catch {
          stored = null;
        }
      }
      // No stored baseline (new user/browser): treat current alerts as
      // already-seen so we don't toast a backlog on first load.
      seenAlertIds.current = stored ?? new Set(alerts.map((a) => a.id));
      return;
    }

    const ids = new Set(alerts.map((a) => a.id));
    if (notificationsOn) {
      const fresh = alerts.filter(
        (a) => !seenAlertIds.current!.has(a.id) && !a.read,
      );
      if (fresh.length > 0) {
        notify({ title: fresh[0].title, description: fresh[0].message });
      }
    }
    seenAlertIds.current = ids;
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
      } catch {
        // localStorage unavailable (private mode, quota) — degrade to in-memory only.
      }
    }
  }, [alerts, notificationsOn, notify, storageKey]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && unreadCount > 0) {
          void readAllAlerts();
        }
      }}
    >
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