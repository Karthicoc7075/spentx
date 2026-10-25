"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminCard,
  AdminEmptyState,
  AdminErrorState,
  AdminLoading,
  AdminPageHeader,
  StatusPill,
  errorMessage,
} from "@/components/admin/admin-ui";
import { fetchSmsTemplateRequests, setSmsTemplateRequestStatus } from "@/lib/supabase-data";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import type { SmsTemplateRequest } from "@/types";

const MIGRATION = "20261025170000_p7_sms_template_requests.sql";
const FILTERS = ["new", "added", "ignored"] as const;
type Filter = (typeof FILTERS)[number];

const tone = { new: "warning", added: "success", ignored: "muted" } as const;

/**
 * Detection v2 Phase 7: masked bank-SMS formats phones could not parse.
 * Text is masked on the phone (every digit is '#', names / refs are
 * placeholders), so nothing here identifies a user or an amount.
 */
export function AdminTemplateRequestsPage() {
  const [filter, setFilter] = useState<Filter>("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const requests = useQuery({
    queryKey: ["admin-template-requests"],
    queryFn: fetchSmsTemplateRequests,
  });

  const rows = useMemo(
    () => (requests.data ?? []).filter((r) => r.status === filter),
    [requests.data, filter],
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { new: 0, added: 0, ignored: 0 };
    for (const r of requests.data ?? []) c[r.status] += 1;
    return c;
  }, [requests.data]);

  async function setStatus(row: SmsTemplateRequest, status: Filter) {
    setBusyId(row.id);
    try {
      await setSmsTemplateRequestStatus(row.id, status);
      queryClient.setQueryData<SmsTemplateRequest[]>(["admin-template-requests"], (current) =>
        (current ?? []).map((r) => (r.id === row.id ? { ...r, status } : r)),
      );
      notify({ title: status === "added" ? "Marked as added" : status === "ignored" ? "Ignored" : "Moved back to new" });
    } catch (error) {
      notify({ title: "Could not update request", description: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Template requests"
        description={
          <>
            Bank SMS formats phones could not read, masked on the device. Add a matching
            template on <Link className="underline" href="/admin/sms-rules">SMS rules</Link>, then
            mark it added.
          </>
        }
      />
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground hover:text-foreground",
              filter === value && "bg-background text-foreground shadow-sm",
            )}
          >
            {value} {counts[value]}
          </button>
        ))}
      </div>
      {requests.isLoading ? <AdminLoading /> : null}
      {requests.error ? (
        <AdminErrorState error={requests.error} migration={MIGRATION} onRetry={() => requests.refetch()} />
      ) : null}
      {!requests.isLoading && !requests.error && rows.length === 0 ? (
        <AdminEmptyState
          title={filter === "new" ? "No new requests" : `No ${filter} requests`}
          description="Phones send a request when a bank SMS matches no template."
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="grid gap-3">
          {rows.map((row) => (
            <AdminCard key={row.id} className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={tone[row.status]}>{row.status}</StatusPill>
                {row.bank ? <StatusPill tone="info">{row.bank}</StatusPill> : null}
                {row.sender ? <StatusPill>{row.sender}</StatusPill> : null}
                <span className="text-xs text-muted-foreground">
                  Seen {row.count}× by {row.userCount} {row.userCount === 1 ? "user" : "users"}
                  {row.lastSeen ? ` · last ${new Date(row.lastSeen).toLocaleString()}` : ""}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">
                {row.maskedText}
              </p>
              <div className="flex flex-wrap gap-2">
                {row.status !== "added" ? (
                  <Button size="sm" disabled={busyId === row.id} onClick={() => void setStatus(row, "added")}>
                    <Check className="mr-1.5 size-3.5" /> Mark added
                  </Button>
                ) : null}
                {row.status !== "ignored" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() => void setStatus(row, "ignored")}
                  >
                    <EyeOff className="mr-1.5 size-3.5" /> Ignore
                  </Button>
                ) : null}
                {row.status !== "new" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === row.id}
                    onClick={() => void setStatus(row, "new")}
                  >
                    <RotateCcw className="mr-1.5 size-3.5" /> Back to new
                  </Button>
                ) : null}
              </div>
            </AdminCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}
