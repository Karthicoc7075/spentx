"use client";

import { Bell } from "lucide-react";
import { AlertItem } from "@/components/shared/AlertItem";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmartAlerts } from "@/hooks/useSmartAlerts";

export default function AlertsPage() {
  const { alerts, isLoading, readAlert, readAllAlerts, unreadCount } =
    useSmartAlerts();

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
            <Bell className="size-6 text-primary" />
            Smart Alerts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Context-aware alerts to help you stay on track without overwhelm.
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button variant="outline" onClick={() => void readAllAlerts()}>
            Mark all as read
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : alerts.length > 0 ? (
        <div className="grid gap-2">
          {alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onRead={(id) => void readAlert(id)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No alerts right now. They&apos;ll appear when spending deviates from your
          plan or daily limits.
        </p>
      )}
    </div>
  );
}