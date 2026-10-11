"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminCard, AdminErrorState, AdminLoading } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { fetchAdminMetrics } from "@/lib/admin-api";

const tick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--card-foreground)",
  fontSize: 12,
};

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function AdminMetricsCharts() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-metrics", days],
    queryFn: () => fetchAdminMetrics(days),
    staleTime: 60_000,
  });

  const series = (data?.series ?? []).map((point) => ({
    ...point,
    label: shortDate(point.date),
    smsRate: point.transactions ? Math.round((point.smsDetected / point.transactions) * 100) : 0,
  }));
  const totals = series.reduce(
    (acc, point) => ({
      signups: acc.signups + point.signups,
      tx: acc.tx + point.transactions,
      sms: acc.sms + point.smsDetected,
    }),
    { signups: 0, tx: 0, sms: 0 },
  );

  return (
    <AdminCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity (IST days)</h3>
          <p className="text-xs text-muted-foreground">
            {totals.signups} signups · {totals.tx} new transactions ·{" "}
            {totals.tx ? Math.round((totals.sms / totals.tx) * 100) : 0}% SMS-detected
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((value) => (
            <Button
              key={value}
              size="xs"
              variant={days === value ? "default" : "outline"}
              onClick={() => setDays(value)}
            >
              {value}d
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <AdminLoading label="Loading charts…" />
      ) : error ? (
        <AdminErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-56 min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Signups & active users</p>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="activeUsers" name="Active users" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="signups" name="Signups" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="h-56 min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">New transactions (SMS-detected vs other)</p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series.map((point) => ({ ...point, other: point.transactions - point.smsDetected }))}
                margin={{ left: -20, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="smsDetected" name="SMS-detected" stackId="tx" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Manual / other" stackId="tx" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
