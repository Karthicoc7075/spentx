"use client";

import {
  AlertTriangle,
  ArrowRight,
  Database,
  DatabaseBackup,
  HardDrive,
  ReceiptText,
  ScrollText,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AdminResetAllModal } from "@/components/admin/AdminResetAllModal";
import { KpiCard } from "@/components/shared/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fetchAdminOverview } from "@/lib/admin-api";
import { fetchAppConfig, saveAppConfig } from "@/lib/supabase-data";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const quickLinks = [
  {
    href: "/admin/users",
    label: "User Management & Analytics",
    desc: "Inspect active users, transaction limits, and per-user financial stats",
    icon: Users,
  },
  {
    href: "/admin/database",
    label: "Database & Backups Explorer",
    desc: "Browse live tables, database schemas, and system backup archives",
    icon: Database,
  },
  {
    href: "/admin/logs",
    label: "System Logs, Rules & Settings",
    desc: "View audit logs, API telemetry, SMS rules, and global app configuration",
    icon: ScrollText,
  },
];

export function AdminOverviewPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
    staleTime: 60_000,
  });

  const { data: appConfig } = useQuery({
    queryKey: ["app-config-shell"],
    queryFn: fetchAppConfig,
    staleTime: 60_000,
  });

  const handleMaintenanceToggle = async (checked: boolean) => {
    if (!appConfig) return;
    try {
      await saveAppConfig({ ...appConfig, maintenanceMode: checked });
      queryClient.invalidateQueries({ queryKey: ["app-config-shell"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      notify({
        title: checked ? "Maintenance mode enabled" : "Maintenance mode disabled",
        description: checked
          ? "Non-admin users now see a maintenance notice instead of the app."
          : "Users have full access again.",
      });
    } catch {
      notify({
        title: "Update failed",
        description: "Could not update maintenance mode.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* ── Top KPI Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          title="Total users"
          value={String(overview?.totalUsers ?? 0)}
          inlineMeta={`+${overview?.newUsersWeek ?? 0} this week · +${overview?.newUsersMonth ?? 0} this month`}
        />
        <KpiCard
          icon={ReceiptText}
          title="Total transactions"
          value={String(overview?.totalTransactions ?? 0)}
          inlineMeta="across all ledger records"
        />
        <KpiCard
          icon={Wallet}
          title="Total volume"
          value={formatCurrency(overview?.totalVolume ?? 0)}
          inlineMeta={`${formatCurrency(overview?.expenseVolume ?? 0)} spend · ${formatCurrency(overview?.incomeVolume ?? 0)} income`}
        />
        <KpiCard
          icon={UserPlus}
          title="Backups (7 days)"
          value={String(overview?.backupsLast7d ?? 0)}
          inlineMeta={`${overview?.backupFailuresLast7d ?? 0} failed`}
          tone={overview?.backupFailuresLast7d ? "danger" : "default"}
        />
      </div>

      {/* ── Maintenance Mode & System Controls ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80 shadow-sm transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-2.5">
              <HardDrive className="size-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Storage usage</h2>
            </div>
            {overview?.storage?.length ? (
              <div className="mt-5 grid gap-3">
                {overview.storage.map((bucket) => (
                  <div
                    key={bucket.bucket}
                    className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{bucket.bucket}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {bucket.objects} objects · {formatBytes(bucket.bytes)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(5, (bucket.bytes / (1024 * 1024 * 100)) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Storage bucket metrics are currently unavailable or zero.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-500" />
                  <h2 className="text-base font-bold text-foreground">
                    System Maintenance Control
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When enabled, all non-admin user sessions are restricted and shown a
                  maintenance lock notice. Admin credentials maintain full system access.
                </p>
              </div>
              <Switch
                checked={Boolean(appConfig?.maintenanceMode)}
                onCheckedChange={handleMaintenanceToggle}
              />
            </div>
            {appConfig?.maintenanceMode ? (
              <div className="mt-4 rounded-xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                ⚠️ Maintenance mode is ACTIVE — user application access is paused.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                ✓ Normal Operation — User application access is active.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Core Admin Hubs ── */}
      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-bold text-foreground">Primary Admin Hubs</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quick jump to core system management sections
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  className="group flex flex-col justify-between gap-4 rounded-2xl border border-border/70 p-4 transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm"
                  href={link.href}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Icon className="size-4" />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {link.label}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {link.desc}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Danger Zone ── */}
      <Card className="rounded-2xl border-rose-500/30 bg-rose-500/5 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Trash2 className="size-4" />
              Reset All System Data
            </h4>
            <p className="text-xs text-muted-foreground">
              Permanently wipe all transactions, outings, expenses, settlements, accounts, categories, and audit logs.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setResetModalOpen(true)}
            className="gap-2 font-semibold rounded-xl"
          >
            <Trash2 className="size-4" />
            Reset All Data
          </Button>
        </CardContent>
      </Card>

      <AdminResetAllModal
        open={resetModalOpen}
        onOpenChange={setResetModalOpen}
      />
    </div>
  );
}
