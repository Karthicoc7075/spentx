"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const KIND_FILTERS = ["all", "debit", "credit", "upi", "card", "wallet"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

const tone = { new: "warning", added: "success", ignored: "muted" } as const;

type TransactionKind = {
  label: string;
  tone: "warning" | "success" | "info" | "muted";
  typeKey: "debit" | "credit" | "upi" | "card" | "wallet" | "other";
};

function detectTransactionKind(text: string): TransactionKind {
  const lower = text.toLowerCase();
  if (lower.includes("wallet") || lower.includes("paytm") || lower.includes("amazon pay") || lower.includes("phonepe wallet")) {
    return { label: "Wallet Transfer", tone: "warning", typeKey: "wallet" };
  }
  if (lower.includes("atm") || lower.includes("cash withdrawal")) {
    return { label: "ATM Withdrawal", tone: "info", typeKey: "other" };
  }
  if (lower.includes("credited") || lower.includes("salary") || lower.includes("refund") || lower.includes("cashback") || lower.includes("deposited")) {
    return { label: "Income / Credit", tone: "success", typeKey: "credit" };
  }
  if (lower.includes("card") || lower.includes("pos") || lower.includes("swiped") || lower.includes("spent on card")) {
    return { label: "Card Swipe", tone: "info", typeKey: "card" };
  }
  if (lower.includes("upi") || lower.includes("vpa") || lower.includes("@")) {
    return { label: "UPI Transfer", tone: "info", typeKey: "upi" };
  }
  if (lower.includes("debited") || lower.includes("spent") || lower.includes("paid") || lower.includes("withdrawn")) {
    return { label: "Expense / Debit", tone: "warning", typeKey: "debit" };
  }
  return { label: "Bank Alert", tone: "muted", typeKey: "other" };
}

function generateSuggestedRegex(maskedText: string): string {
  // Escape regex specials except our angle-bracket tokens
  let pattern = maskedText
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  pattern = pattern
    .replace(/<AMT>/g, "(?<amount>\\d+(?:\\.\\d{1,2})?)")
    .replace(/<BAL>/g, "(?<balance>\\d+(?:\\.\\d{1,2})?)")
    .replace(/<ACCT>/g, "(?<account>[a-zA-Z0-9*]{4,})")
    .replace(/<REF>/g, "(?<ref>[a-zA-Z0-9]+)")
    .replace(/<NAME>/g, "(?<merchant>[^.,\\n]+)")
    .replace(/<UPI>/g, "(?<vpa>[\\w.\\-]+@[a-zA-Z][\\w.\\-]*)")
    .replace(/<DATE>/g, "(?<date>[0-9]{1,4}[-/.](?:[0-9]{1,2}|[a-zA-Z]{3,9})[-/.][0-9]{2,4})")
    .replace(/<TIME>/g, "(?<time>[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\\s?[ap]m)?)")
    .replace(/<NUM>/g, "\\d+")
    .replace(/#+/g, "\\d+");

  return `(?i)^.*${pattern}.*$`;
}

function MaskedMessageVisualizer({ text }: { text: string }) {
  // Regex splitting by known placeholder tokens
  const tokenRegex = /(<AMT>|<BAL>|<ACCT>|<REF>|<NAME>|<UPI>|<DATE>|<TIME>|<NUM>|<URL>|#+)/g;
  const parts = text.split(tokenRegex);

  return (
    <div className="flex flex-wrap items-center gap-1.5 leading-relaxed font-mono text-xs">
      {parts.map((part, idx) => {
        if (!part) return null;
        switch (part) {
          case "<AMT>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-emerald-600 dark:text-emerald-400"
              >
                ₹ AMOUNT
              </span>
            );
          case "<BAL>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400"
              >
                ₹ BALANCE
              </span>
            );
          case "<ACCT>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-blue-600 dark:text-blue-400"
              >
                A/C NUMBER
              </span>
            );
          case "<REF>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-purple-600 dark:text-purple-400"
              >
                REF / UTR
              </span>
            );
          case "<NAME>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-indigo-600 dark:text-indigo-400"
              >
                MERCHANT / PAYEE
              </span>
            );
          case "<UPI>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-cyan-600 dark:text-cyan-400"
              >
                VPA @ UPI
              </span>
            );
          case "<DATE>":
          case "<TIME>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-slate-500/30 bg-slate-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                {part === "<DATE>" ? "DATE" : "TIME"}
              </span>
            );
          case "<NUM>":
            return (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground"
              >
                NUMBER
              </span>
            );
          default:
            if (part.startsWith("#")) {
              return (
                <span
                  key={idx}
                  className="inline-flex items-center rounded border border-border bg-muted/60 px-1 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  {part}
                </span>
              );
            }
            return (
              <span key={idx} className="text-foreground">
                {part}
              </span>
            );
        }
      })}
    </div>
  );
}

/**
 * Detection v2 Phase 7: Bank & Wallet SMS template requests.
 * Features:
 * - Smart transaction classification (Debit, Credit, UPI, Wallet, ATM)
 * - Visual token highlighter (<AMT>, <BAL>, <ACCT>, <NAME>, <REF>)
 * - 1-click suggested regex generator & copy
 * - Direct link to SMS Rules & Merchant Rules for rapid rule creation
 */
export function AdminTemplateRequestsPage() {
  const [filter, setFilter] = useState<Filter>("new");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [rawViewIds, setRawViewIds] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { notify } = useToast();
  const requests = useQuery({
    queryKey: ["admin-template-requests"],
    queryFn: fetchSmsTemplateRequests,
  });

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { new: 0, added: 0, ignored: 0 };
    for (const r of requests.data ?? []) c[r.status] += 1;
    return c;
  }, [requests.data]);

  const rows = useMemo(() => {
    let list = (requests.data ?? []).filter((r) => r.status === filter);

    if (kindFilter !== "all") {
      list = list.filter((r) => {
        const kind = detectTransactionKind(r.maskedText);
        return kind.typeKey === kindFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.bank.toLowerCase().includes(q) ||
          r.sender.toLowerCase().includes(q) ||
          r.maskedText.toLowerCase().includes(q),
      );
    }

    return list;
  }, [requests.data, filter, kindFilter, searchQuery]);

  async function setStatus(row: SmsTemplateRequest, status: Filter) {
    setBusyId(row.id);
    try {
      await setSmsTemplateRequestStatus(row.id, status);
      queryClient.setQueryData<SmsTemplateRequest[]>(["admin-template-requests"], (current) =>
        (current ?? []).map((r) => (r.id === row.id ? { ...r, status } : r)),
      );
      notify({
        title: status === "added" ? "Marked as added" : status === "ignored" ? "Ignored" : "Moved back to new",
      });
    } catch (error) {
      notify({ title: "Could not update request", description: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  function copyRegex(row: SmsTemplateRequest) {
    const regex = generateSuggestedRegex(row.maskedText);
    navigator.clipboard.writeText(regex);
    notify({
      title: "Suggested Regex copied!",
      description: "Paste it directly into the SMS rule template pattern.",
    });
  }

  function copySample(row: SmsTemplateRequest) {
    navigator.clipboard.writeText(row.maskedText);
    notify({ title: "Sample text copied!" });
  }

  function toggleViewMode(id: string) {
    setRawViewIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="grid gap-5">
      <AdminPageHeader
        title="Template requests"
        description={
          <>
            Bank & wallet SMS formats reported for parsing. Inspect formatted tokens, generate
            capture regex in 1-click, and add matching templates on{" "}
            <Link className="underline font-medium hover:text-foreground" href="/admin/sms-rules">
              SMS rules
            </Link>{" "}
            or{" "}
            <Link className="underline font-medium hover:text-foreground" href="/admin/merchant-rules">
              Merchant rules
            </Link>
            .
          </>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground hover:text-foreground transition-all",
                  filter === value && "bg-background text-foreground shadow-sm",
                )}
              >
                {value} {counts[value]}
              </button>
            ))}
          </div>

          {/* Kind filter pills */}
          <div className="hidden lg:flex items-center gap-1 text-xs">
            {KIND_FILTERS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all",
                  kindFilter === kind
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {kind === "all" ? "All types" : kind}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bank, sender..."
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {requests.isLoading ? <AdminLoading /> : null}
      {requests.error ? (
        <AdminErrorState error={requests.error} migration={MIGRATION} onRetry={() => requests.refetch()} />
      ) : null}

      {!requests.isLoading && !requests.error && rows.length === 0 ? (
        <AdminEmptyState
          title={searchQuery ? "No matching requests" : filter === "new" ? "No new requests" : `No ${filter} requests`}
          description={
            searchQuery
              ? "Try clearing your search query or switching filters."
              : "Phones submit a template request when a bank or wallet SMS cannot be parsed."
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="grid gap-3.5">
          {rows.map((row) => {
            const kind = detectTransactionKind(row.maskedText);
            const isRawView = rawViewIds[row.id] ?? false;
            const hasMerchantToken = row.maskedText.includes("<NAME>");

            return (
              <AdminCard key={row.id} className="grid gap-3.5 p-4 transition-all hover:border-border/80">
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={tone[row.status]}>{row.status}</StatusPill>
                    <StatusPill tone={kind.tone}>{kind.label}</StatusPill>
                    {row.bank ? <StatusPill tone="info">{row.bank}</StatusPill> : null}
                    {row.sender ? <StatusPill>{row.sender}</StatusPill> : null}
                    <span className="text-xs text-muted-foreground">
                      Seen {row.count}× by {row.userCount} {row.userCount === 1 ? "device" : "devices"}
                      {row.lastSeen ? ` · last ${new Date(row.lastSeen).toLocaleDateString()}` : ""}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleViewMode(row.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isRawView ? <Eye className="size-3" /> : <Tag className="size-3" />}
                    {isRawView ? "Show visual tokens" : "Show raw tokens"}
                  </button>
                </div>

                {/* Message display */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                  {isRawView ? (
                    <p className="whitespace-pre-wrap break-words font-mono text-xs text-foreground leading-relaxed">
                      {row.maskedText}
                    </p>
                  ) : (
                    <MaskedMessageVisualizer text={row.maskedText} />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1-click Regex copy */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyRegex(row)}
                      className="gap-1.5 text-xs font-medium"
                    >
                      <Sparkles className="size-3 text-primary" />
                      Copy Suggested Regex
                    </Button>

                    {/* Copy Sample */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copySample(row)}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="size-3" />
                      Copy Sample
                    </Button>

                    {/* Direct link to SMS rules with context */}
                    <Link
                      href={`/admin/sms-rules`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:underline hover:bg-primary/5 transition-colors"
                    >
                      Create SMS Rule <ExternalLink className="size-3" />
                    </Link>

                    {/* Add merchant rule shortcut */}
                    {hasMerchantToken ? (
                      <Link
                        href={`/admin/merchant-rules`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline hover:bg-indigo-500/10 transition-colors"
                      >
                        Add Merchant Rule <ArrowRight className="size-3" />
                      </Link>
                    ) : null}
                  </div>

                  {/* Status update actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
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
                </div>
              </AdminCard>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
