"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChartPie,
  DatabaseBackup,
  KeyRound,
  Loader2,
  ReceiptText,
  Trash2,
  UserCog,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/shared/KpiCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminDeleteUser,
  adminResetPassword,
  fetchAdminUserOverview,
} from "@/lib/admin-api";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { formatIST, formatISTDate } from "@/lib/admin-format";

export function AdminUserDetailPage({ userId }: { userId: string }) {
  const { notify } = useToast();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // fetchAdminUserOverview's RPC writes the 'view_row' admin action log
  // entry server-side — viewing this page is itself an audited action.
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-overview", userId],
    queryFn: () => fetchAdminUserOverview(userId),
  });

  const handleDeleteUser = async () => {
    setIsDeleting(true);
    try {
      await adminDeleteUser(userId);
      notify({
        title: "User deleted",
        description: "The user and all their data have been removed.",
      });
      router.replace("/admin/users");
    } catch (err) {
      notify({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete the user.",
      });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.profile) {
    return (
      <div className="grid gap-4">
        <Link
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          href="/admin/users"
        >
          <ArrowLeft className="size-3.5" /> Back to users
        </Link>
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "User not found."}
        </div>
      </div>
    );
  }

  const { profile } = data;
  const maxCategoryAmount = Math.max(
    1,
    ...data.spendByCategory.map((entry) => entry.amount),
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            className="mb-2 flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            href="/admin/users"
          >
            <ArrowLeft className="size-3.5" /> Back to users
          </Link>
          <h2 className="text-lg font-bold tracking-tight">{profile.name}</h2>
          <p className="text-xs text-muted-foreground">
            {profile.email}
            {profile.phone ? ` · ${profile.phone}` : ""} · joined{" "}
            {formatISTDate(profile.joinedAt)} ·{" "}
            {profile.role}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-9 border-amber-500/50 text-xs font-bold text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
            variant="outline"
            onClick={() =>
              router.push(`/admin/users/${userId}/impersonate/dashboard`)
            }
          >
            <UserCog className="mr-1.5 size-3.5" /> Impersonate user
          </Button>
          <Button
            className="h-9 text-xs font-bold"
            disabled={isSendingReset}
            variant="outline"
            onClick={async () => {
              setIsSendingReset(true);
              try {
                await adminResetPassword(userId);
                notify({
                  title: "Reset email sent",
                  description: `A password reset link was emailed to ${profile.email}. They must click it and choose a new password themselves — nothing changes until they do.`,
                });
              } catch (err) {
                notify({
                  title: "Reset failed",
                  description:
                    err instanceof Error ? err.message : "Could not send reset email.",
                });
              } finally {
                setIsSendingReset(false);
              }
            }}
          >
            {isSendingReset ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <KeyRound className="mr-1.5 size-3.5" />
            )}
            Send password reset email
          </Button>
          <Button
            className="h-9 border-rose-500/40 text-xs font-bold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
            variant="outline"
            onClick={() => {
              setDeleteOpen(true);
              setDeleteConfirmText("");
            }}
          >
            <Trash2 className="mr-1.5 size-3.5" /> Delete user
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ReceiptText}
          title="Transactions"
          value={String(data.txCount)}
        />
        <KpiCard
          icon={CalendarDays}
          title="Spend this month"
          value={formatCurrency(data.monthSpend)}
        />
        <KpiCard
          icon={ChartPie}
          title="Total spend"
          value={formatCurrency(data.totalSpend)}
        />
        <KpiCard
          icon={Wallet}
          title="Total income"
          value={formatCurrency(data.totalIncome)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">Spend by category</h3>
            {data.spendByCategory.length ? (
              <div className="mt-4 grid gap-2.5">
                {data.spendByCategory.map((entry) => (
                  <div key={entry.categoryId} className="grid gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(entry.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#8b7ff0]"
                        style={{
                          width: `${Math.max(2, (entry.amount / maxCategoryAmount) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No expense splits yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">Accounts</h3>
            {data.accounts.length ? (
              <div className="mt-4 grid gap-2">
                {data.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold">
                        {account.name}
                        {account.last4 ? ` ····${account.last4}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {account.type}
                        {account.isActive ? "" : " · inactive"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-semibold",
                        account.balance < 0 && "text-rose-500",
                      )}
                    >
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No accounts.</p>
            )}

            <h3 className="mt-5 text-sm font-semibold">Purposes</h3>
            {data.purposes.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.purposes.map((purpose) => (
                  <span
                    key={purpose.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium",
                      !purpose.isActive && "opacity-50",
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: purpose.color }}
                    />
                    {purpose.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No purposes.</p>
            )}

            <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <DatabaseBackup className="size-3.5" />
              {data.lastBackup
                ? `Last backup: ${formatIST(data.lastBackup.created_at)} (${data.lastBackup.status})`
                : "No backups yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── User Outings & Friends Detail Grid ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Outings Card */}
        <Card className="border border-border/80 bg-card/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Trips & Outings ({data.outings?.length ?? 0})</h3>
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400 border border-violet-500/20">
                Outing Ledger
              </span>
            </div>
            {data.outings?.length ? (
              <div className="grid gap-2">
                {data.outings.map((outing) => (
                  <div
                    key={outing.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="font-bold text-xs text-foreground">🏖️ {outing.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {outing.startDate ? formatISTDate(outing.startDate) : "No start date"}
                        {outing.endDate ? ` — ${formatISTDate(outing.endDate)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-foreground block">
                        {formatCurrency(outing.totalAmount)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                          outing.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {outing.status || "active"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No trips or outings created.</p>
            )}
          </CardContent>
        </Card>

        {/* Friends & Contributors Card */}
        <Card className="border border-border/80 bg-card/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Friends & Contributors ({data.friends?.length ?? 0})</h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Split Contacts
              </span>
            </div>
            {data.friends?.length ? (
              <div className="grid gap-2">
                {data.friends.map((friend) => {
                  const isOwed = friend.netBalance > 0;
                  const isSettled = friend.netBalance === 0;
                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5"
                    >
                      <div>
                        <p className="font-bold text-xs text-foreground">👤 {friend.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {friend.phone || "No phone number"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            "font-mono font-bold text-xs block",
                            isOwed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : isSettled
                                ? "text-muted-foreground"
                                : "text-rose-500",
                          )}
                        >
                          {isOwed ? `+${formatCurrency(friend.netBalance)}` : formatCurrency(friend.netBalance)}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                          {isOwed ? "Gets Back" : isSettled ? "Settled" : "Owes Return"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No linked friends or split contacts.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/80 bg-card/40 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">User Transactions & Activity Ledger</h3>
              <p className="text-xs text-muted-foreground">
                Includes outing splits, shared purposes, and friend returns/contributions.
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
              {data.recentTransactions.length} Recent
            </span>
          </div>

          {data.recentTransactions.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 font-bold text-foreground">
                    <th className="px-4 py-3">Merchant / Details</th>
                    <th className="px-4 py-3">Type & Outing / Purpose</th>
                    <th className="px-4 py-3">Friend / Contributor Splits</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.map((tx) => {
                    const isIncome = tx.type === "income";
                    const isExpense = tx.type === "expense";
                    const isTransfer = tx.type === "transfer";

                    return (
                      <tr key={tx.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-foreground">{tx.merchant || "Transaction"}</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{tx.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border",
                                isIncome
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : isTransfer
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                              )}
                            >
                              {tx.type}
                            </span>

                            {tx.outing_name ? (
                              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400 border border-violet-500/20">
                                🏖️ Outing: {tx.outing_name}
                              </span>
                            ) : null}

                            {tx.purpose_name ? (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                🤝 {tx.purpose_name}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {tx.splits && tx.splits.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {tx.splits.map((s, idx) => (
                                <span
                                  key={idx}
                                  className={cn(
                                    "rounded-lg px-2 py-0.5 text-[10px] font-bold border",
                                    s.isReturn
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                                  )}
                                >
                                  {s.friendName || "Friend"}: {s.isReturn ? `+${formatCurrency(s.amount)} Return` : `-${formatCurrency(s.amount)} Split`}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {formatISTDate(tx.transaction_date)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-bold font-mono text-sm",
                            isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                          )}
                        >
                          {isIncome ? "+" : "−"}{formatCurrency(tx.total_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No transactions recorded for this user.</p>
          )}
        </CardContent>
      </Card>

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="sx-surface w-full max-w-sm space-y-4 p-6 text-center">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertTriangle className="size-6" />
              </span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">
                Delete {profile.name}&apos;s account?
              </h3>
              <p className="text-xs leading-normal text-muted-foreground">
                This permanently deletes{" "}
                <span className="font-extrabold text-foreground">{profile.email}</span>{" "}
                and ALL of their data — transactions, accounts, backups,
                everything — via cascade. This cannot be undone.
              </p>
              <p className="text-xs leading-normal text-muted-foreground">
                Type <span className="font-extrabold text-foreground">DELETE</span> to confirm.
              </p>
            </div>
            <Input
              autoFocus
              className="text-center"
              placeholder="DELETE"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <Button
                className="h-10 flex-1 text-xs font-bold"
                disabled={isDeleting}
                variant="outline"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="h-10 flex-1 bg-rose-500 text-xs font-bold text-white hover:bg-rose-600"
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                onClick={handleDeleteUser}
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
