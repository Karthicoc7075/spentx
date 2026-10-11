"use client";

import {
  Activity,
  AlertTriangle,
  DatabaseBackup,
  HardDrive,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { KpiCard } from "@/components/shared/KpiCard";
import { AdminResetAllModal } from "@/components/admin/AdminResetAllModal";
import { AdminMetricsCharts } from "@/components/admin/AdminMetricsCharts";
import {
  AdminCard,
  AdminConfirmDialog,
  AdminErrorState,
  AdminPageHeader,
  StatusPill,
} from "@/components/admin/admin-ui";
import { fetchAdminOverview } from "@/lib/admin-api";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Updates ONLY maintenance_mode, so a stale cached config can't overwrite other settings. */
async function setMaintenanceMode(enabled: boolean) {
  const { data, error } = await createClient()
    .from("global_settings")
    .update({ maintenance_mode: enabled })
    .eq("id", "app")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No settings row was updated (missing row or no permission).");
}

export function AdminOverviewPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [maintenanceTarget, setMaintenanceTarget] = useState<boolean | null>(null);

  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error || !overview) {
    return <AdminErrorState error={error} onRetry={() => refetch()} />;
  }

  const maxBucketBytes = Math.max(1, ...overview.storage.map((bucket) => bucket.bytes));
  const maintenanceOn = Boolean(overview.maintenanceMode);

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="Overview"
        description="Totals use confirmed transactions only (unverified, rejected and failed rows, transfers and outing roll-ups are excluded). Months use IST."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          title="Total users"
          value={overview.totalUsers.toLocaleString("en-IN")}
          inlineMeta={`+${overview.newUsersWeek} in 7 days · +${overview.newUsersMonth} this month${
            overview.suspendedUsers ? ` · ${overview.suspendedUsers} suspended` : ""
          }`}
        />
        <KpiCard
          icon={Activity}
          title="Active users (7 days)"
          value={(overview.activeUsers7d ?? 0).toLocaleString("en-IN")}
          inlineMeta={`${overview.apiErrors24h ?? 0} API errors in 24h`}
          tone={overview.apiErrors24h ? "warning" : "default"}
        />
        <KpiCard
          icon={Wallet}
          title="Money tracked"
          value={formatCurrency(overview.totalVolume)}
          inlineMeta={`${formatCurrency(overview.expenseVolume)} spent · ${formatCurrency(overview.incomeVolume)} income`}
        />
        <KpiCard
          icon={DatabaseBackup}
          title="Backups (7 days)"
          value={String(overview.backupsLast7d)}
          inlineMeta={`${overview.backupFailuresLast7d} failed`}
          tone={overview.backupFailuresLast7d ? "danger" : "default"}
          onClick={overview.backupFailuresLast7d ? () => (window.location.href = "/admin/backups?status=failed") : undefined}
        />
      </div>

      <AdminMetricsCharts />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard>
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Storage</h3>
          </div>
          {overview.storage.length ? (
            <div className="mt-4 grid gap-3">
              {overview.storage.map((bucket) => (
                <div key={bucket.bucket} className="grid gap-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{bucket.bucket}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {bucket.objects.toLocaleString("en-IN")} files · {formatBytes(bucket.bytes)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    {/* relative to the largest bucket — not a quota */}
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (bucket.bytes / maxBucketBytes) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Bars are relative to the largest bucket.</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No storage objects (or storage stats unavailable).</p>
          )}
        </AdminCard>

        <AdminCard>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">Maintenance mode</h3>
                {maintenanceOn ? <StatusPill tone="warning">On</StatusPill> : <StatusPill tone="success">Off</StatusPill>}
              </div>
              <p className="text-xs text-muted-foreground">
                When on, signed-in non-admin users of the <strong>website</strong> see a maintenance notice.
                The mobile app does not read this flag yet.
              </p>
            </div>
            <Switch checked={maintenanceOn} onCheckedChange={(checked) => setMaintenanceTarget(checked)} />
          </div>
        </AdminCard>
      </div>

      <AdminCard className="border-destructive/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <Trash2 className="size-4" /> Reset all data
            </h3>
            <p className="text-xs text-muted-foreground">
              Deletes every non-admin account and all app data (transactions, outings, accounts,
              categories, logs). Keeps admin accounts, global settings, mail templates and the admin
              audit log. Requires <code className="font-mono">ADMIN_RESET_PASSWORD</code> on the server.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setResetModalOpen(true)}>
            <Trash2 className="size-4" /> Reset all data
          </Button>
        </div>
      </AdminCard>

      <p className="text-xs text-muted-foreground">
        Need a specific user? <Link className="text-primary hover:underline" href="/admin/users">Search users</Link>.
      </p>

      <AdminResetAllModal open={resetModalOpen} onOpenChange={setResetModalOpen} />

      <AdminConfirmDialog
        open={maintenanceTarget !== null}
        onOpenChange={(open) => !open && setMaintenanceTarget(null)}
        title={maintenanceTarget ? "Turn maintenance mode on?" : "Turn maintenance mode off?"}
        description={
          maintenanceTarget
            ? "Non-admin website users will be locked out until you turn it off."
            : "Users regain full access to the website."
        }
        confirmLabel={maintenanceTarget ? "Turn on" : "Turn off"}
        destructive={Boolean(maintenanceTarget)}
        onConfirm={async () => {
          const enabled = Boolean(maintenanceTarget);
          await setMaintenanceMode(enabled);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
            queryClient.invalidateQueries({ queryKey: ["app-config-shell"] }),
          ]);
          notify({ title: enabled ? "Maintenance mode on" : "Maintenance mode off" });
        }}
      />
    </div>
  );
}
