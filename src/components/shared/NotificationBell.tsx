"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { AlertItem } from "@/components/shared/AlertItem";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSmartAlerts } from "@/hooks/useSmartAlerts";

export function NotificationBell() {
  const { alerts, unreadCount, readAlert, readAllAlerts } = useSmartAlerts();
  const preview = alerts.slice(0, 4);

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
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
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