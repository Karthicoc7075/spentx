"use client";

import {
  ArrowLeft,
  Ban,
  CalendarDays,
  ChartPie,
  DatabaseBackup,
  Eye,
  KeyRound,
  Mail,
  MailCheck,
  MessageSquareText,
  PencilLine,
  ReceiptText,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/shared/KpiCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminCard,
  AdminConfirmDialog,
  AdminErrorState,
  StatusPill,
} from "@/components/admin/admin-ui";
import {
  adminDeleteUser,
  adminForceVerifyEmail,
  adminResendVerification,
  adminResetPassword,
  adminResetUserData,
  adminSetSuspended,
  fetchAdminUserOverview,
} from "@/lib/admin-api";
import { formatIST, formatISTDate, formatKb, isInFuture } from "@/lib/admin-format";
import { saveImpersonationRequest } from "@/lib/impersonation-request";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

type DialogKind =
  | null
  | "reset"
  | "resend"
  | "verify"
  | "suspend"
  | "unsuspend"
  | "reset-data"
  | "delete"
  | "write";

function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <AdminCard>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {title}
          {count != null ? <span className="ml-1 text-muted-foreground">({count})</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </AdminCard>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function AdminUserDetailPage({ userId }: { userId: string }) {
  const { notify } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind>(null);

  // The RPC writes the 'view_row' audit entry server-side.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-user-overview", userId],
    queryFn: () => fetchAdminUserOverview(userId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-user-overview", userId] });

  const back = (
    <Link
      className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      href="/admin/users"
    >
      <ArrowLeft className="size-3.5" /> Back to users
    </Link>
  );

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.profile) {
    return (
      <div className="grid gap-4">
        {back}
        {error ? (
          <AdminErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <AdminErrorState error={new Error("This user no longer exists.")} title="User not found" />
        )}
      </div>
    );
  }

  const { profile } = data;
  const auth = data.auth ?? null;
  const isAdminTarget = profile.role === "admin";
  const suspended = isInFuture(auth?.bannedUntil);
  const verified = Boolean(auth?.emailConfirmedAt);
  const maxCategoryAmount = Math.max(1, ...data.spendByCategory.map((entry) => entry.amount));

  const viewAs = (mode: "read" | "write", reason: string | null) => {
    saveImpersonationRequest(userId, { mode, reason });
    router.push(`/admin/users/${userId}/impersonate/dashboard`);
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        {back}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{profile.name || "Unnamed user"}</h2>
              {isAdminTarget ? (
                <StatusPill tone="warning">
                  <ShieldCheck className="size-3" /> Admin
                </StatusPill>
              ) : null}
              {suspended ? <StatusPill tone="danger">Suspended</StatusPill> : null}
              {auth ? (
                verified ? <StatusPill tone="success">Email verified</StatusPill> : <StatusPill>Email unverified</StatusPill>
              ) : null}
            </div>
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              {profile.email}
              {profile.phone ? ` · ${profile.phone}` : ""} · joined {formatISTDate(profile.joinedAt)}
              {auth?.lastSignInAt ? ` · last sign-in ${formatIST(auth.lastSignInAt)}` : ""}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{profile.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => viewAs("read", null)}>
              <Eye className="size-3.5" /> View as user
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("write")}>
              <PencilLine className="size-3.5" /> Act as user…
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("reset")}>
              <KeyRound className="size-3.5" /> Password reset
            </Button>
            {auth && !verified ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialog("resend")}>
                  <Mail className="size-3.5" /> Resend verification
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialog("verify")}>
                  <MailCheck className="size-3.5" /> Mark verified
                </Button>
              </>
            ) : null}
            {!isAdminTarget ? (
              suspended ? (
                <Button size="sm" variant="outline" onClick={() => setDialog("unsuspend")}>
                  <Ban className="size-3.5" /> Unsuspend
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setDialog("suspend")}>
                  <Ban className="size-3.5" /> Suspend
                </Button>
              )
            ) : null}
            {!isAdminTarget ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => setDialog("reset-data")}
                >
                  <RotateCcw className="size-3.5" /> Reset to Onboarding
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDialog("delete")}>
                  <Trash2 className="size-3.5" /> Delete Account
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ReceiptText}
          title="Transactions"
          value={data.txCount.toLocaleString("en-IN")}
          inlineMeta={data.unverifiedCount ? `${data.unverifiedCount} awaiting review` : undefined}
        />
        <KpiCard icon={CalendarDays} title="Spend this month (IST)" value={formatCurrency(data.monthSpend)} />
        <KpiCard icon={ChartPie} title="All-time spend" value={formatCurrency(data.totalSpend)} />
        <KpiCard icon={Wallet} title="All-time income" value={formatCurrency(data.totalIncome)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Spend by category">
          {data.spendByCategory.length ? (
            <div className="grid gap-2.5">
              {data.spendByCategory.map((entry) => (
                <div key={entry.categoryId} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{entry.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatCurrency(entry.amount)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (entry.amount / maxCategoryAmount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No confirmed expenses yet.</Empty>
          )}
        </Section>

        <Section title="Accounts" count={data.accounts.length}>
          {data.accounts.length ? (
            <div className="grid gap-2">
              {data.accounts.map((account) => (
                <div
                  key={account.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs",
                    !account.isActive && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {account.name}
                      {account.last4 ? ` ····${account.last4}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {account.type}
                      {account.isActive ? "" : " · inactive"}
                    </p>
                  </div>
                  <span className={cn("shrink-0 font-medium", account.balance < 0 && "text-destructive")}>
                    {formatCurrency(account.balance)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No accounts.</Empty>
          )}
          <h4 className="mb-2 mt-4 text-xs font-semibold text-foreground">Purposes</h4>
          {data.purposes.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.purposes.map((purpose) => (
                <span
                  key={purpose.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px]",
                    !purpose.isActive && "opacity-50",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: purpose.color }} />
                  {purpose.name}
                </span>
              ))}
            </div>
          ) : (
            <Empty>No purposes.</Empty>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Outings" count={data.outings?.length ?? 0}>
          {data.outings?.length ? (
            <div className="grid gap-2">
              {data.outings.map((outing) => (
                <div key={outing.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{outing.name}</p>
                    <p className="text-muted-foreground">
                      {outing.startDate ? formatISTDate(outing.startDate) : "No date"}
                      {outing.endDate ? ` – ${formatISTDate(outing.endDate)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{formatCurrency(outing.totalAmount)}</p>
                    <StatusPill tone={outing.status === "completed" ? "success" : "info"}>{outing.status || "active"}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No outings.</Empty>
          )}
        </Section>

        <Section
          title="Friends"
          count={data.friends?.length ?? 0}
          action={
            data.friends?.length ? (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => viewAs("read", null)}>
                See balances
              </button>
            ) : null
          }
        >
          {data.friends?.length ? (
            <div className="grid gap-1.5">
              {data.friends.map((friend) => (
                <div key={friend.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{friend.name}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">{friend.phone || "—"}</span>
                </div>
              ))}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Balances open in the read-only user view so they use the same maths as the Friends page.
              </p>
            </div>
          ) : (
            <Empty>No friends.</Empty>
          )}
        </Section>

        <Section title="SMS, wealth & backups">
          <dl className="grid gap-2 text-xs">
            <Row icon={<MessageSquareText className="size-3.5" />} label="SMS-detected (30 days)" value={String(data.sms?.detected30d ?? 0)} />
            <Row label="Last SMS detection" value={data.sms?.lastDetectedAt ? formatIST(data.sms.lastDetectedAt) : "Never"} />
            <Row label="Learned merchants" value={String(data.sms?.learnedMerchants ?? 0)} />
            <Row label="Goals / investments" value={`${data.wealth?.goals ?? 0} / ${data.wealth?.investments ?? 0}`} />
            <Row
              icon={<DatabaseBackup className="size-3.5" />}
              label="Last backup"
              value={
                data.lastBackup
                  ? `${formatIST(data.lastBackup.created_at)} · ${data.lastBackup.status}${
                      data.lastBackup.size_bytes ? ` · ${formatKb(data.lastBackup.size_bytes)}` : ""
                    }`
                  : "None"
              }
            />
            {data.lastBackup?.error_message ? (
              <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{data.lastBackup.error_message}</p>
            ) : null}
          </dl>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Devices" count={data.devices?.length ?? 0}>
          {data.devices?.length ? (
            <div className="grid gap-2">
              {data.devices.map((device) => (
                <div key={device.id} className="flex items-start gap-2 text-xs">
                  <Smartphone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{device.device_label || device.platform || "Device"}</p>
                    <p className="text-muted-foreground">
                      {device.platform ?? "unknown"} · last seen {device.last_seen_at ? formatIST(device.last_seen_at) : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No registered devices.</Empty>
          )}
        </Section>
        <Section title="Recent sign-ins" count={data.logins?.length ?? 0}>
          {data.logins?.length ? (
            <div className="grid gap-1.5">
              {data.logins.map((login) => (
                <div key={login.id} className="flex justify-between gap-2 text-xs">
                  <span>{formatIST(login.logged_in_at)}</span>
                  <span className="truncate text-muted-foreground">{login.platform ?? ""}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No sign-in history recorded.</Empty>
          )}
        </Section>
        <Section
          title="Sync / API errors"
          count={data.recentErrors?.length ?? 0}
          action={
            <Link className="text-xs text-primary hover:underline" href={`/admin/api-logs?user=${encodeURIComponent(profile.email)}&status=error`}>
              All API logs
            </Link>
          }
        >
          {data.recentErrors?.length ? (
            <div className="grid max-h-64 gap-2 overflow-y-auto">
              {data.recentErrors.map((entry) => (
                <div key={entry.id} className="grid gap-0.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-mono">{entry.method ? `${entry.method} ` : ""}{entry.api_name}</span>
                    <span className="shrink-0 text-muted-foreground">{entry.status_code ?? ""}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatIST(entry.created_at)}
                    {entry.platform ? ` · ${entry.platform}` : ""}
                    {entry.app_version ? ` v${entry.app_version}` : ""}
                  </span>
                  {entry.error_message ? <span className="break-words text-[11px] text-destructive">{entry.error_message}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>No errors logged.</Empty>
          )}
        </Section>
      </div>

      <Section
        title="Recent transactions"
        count={data.recentTransactions.length}
        action={
          <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/admin/logs?target=${userId}`}>
            <ScrollText className="size-3.5" /> Audit history
          </Link>
        }
      >
        {data.recentTransactions.length ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 font-semibold">Merchant</th>
                  <th className="px-3 py-2 font-semibold">Type / status</th>
                  <th className="px-3 py-2 font-semibold">Splits</th>
                  <th className="px-3 py-2 font-semibold">Account</th>
                  <th className="px-3 py-2 font-semibold">Date (IST)</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((tx) => {
                  const isIncome = tx.type === "income";
                  return (
                    <tr key={tx.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium">{tx.merchant || "Transaction"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {tx.entry_source ?? ""}
                          {tx.outing_name ? ` · outing: ${tx.outing_name}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <StatusPill tone={isIncome ? "success" : tx.type === "transfer" ? "info" : "muted"}>{tx.type}</StatusPill>
                          {tx.status && tx.status !== "confirmed" ? <StatusPill tone="warning">{tx.status}</StatusPill> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {tx.splits?.length ? (
                          <div className="grid gap-0.5">
                            {tx.splits.map((split, index) => (
                              <span key={index} className="text-[11px]">
                                {formatCurrency(split.amount)} · {split.category ?? "Uncategorised"}
                                {split.purpose ? ` · ${split.purpose}` : ""}
                                {split.contributor ? ` · ${split.contributor}` : ""}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {tx.account_name ?? "—"}
                        {tx.to_account_name ? ` → ${tx.to_account_name}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatISTDate(tx.transaction_date)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono font-medium", isIncome && "text-emerald-600 dark:text-emerald-400")}>
                        {isIncome ? "+" : tx.type === "transfer" ? "" : "−"}
                        {formatCurrency(tx.total_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No transactions.</Empty>
        )}
      </Section>

      {/* ── Dialogs (one shared component) ── */}
      <AdminConfirmDialog
        open={dialog === "write"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Act as this user (write mode)?"
        description="Changes you make are real and saved to their account. Every write is logged with before/after values and your reason."
        confirmLabel="Start write session"
        reason={{ minLength: 5, placeholder: "e.g. Support ticket #123 — fix wrong account on a transaction" }}
        onConfirm={({ reason }) => viewAs("write", reason)}
      />
      <AdminConfirmDialog
        open={dialog === "reset"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Send a password reset email?"
        description={`A reset link is emailed to ${profile.email}. Nothing changes until they choose a new password.`}
        confirmLabel="Send email"
        onConfirm={async () => {
          await adminResetPassword(userId);
          notify({ title: "Reset email sent", description: profile.email });
        }}
      />
      <AdminConfirmDialog
        open={dialog === "resend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Resend verification email?"
        description={`Sends a new confirmation link to ${profile.email}.`}
        confirmLabel="Resend"
        onConfirm={async () => {
          await adminResendVerification(userId);
          notify({ title: "Verification email sent", description: profile.email });
        }}
      />
      <AdminConfirmDialog
        open={dialog === "verify"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Mark email as verified?"
        description="Only do this if you have confirmed they own this address another way."
        confirmLabel="Mark verified"
        onConfirm={async () => {
          await adminForceVerifyEmail(userId);
          await refresh();
          notify({ title: "Email marked verified" });
        }}
      />
      <AdminConfirmDialog
        open={dialog === "suspend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Suspend ${profile.name || profile.email}?`}
        description="They are signed out and cannot sign in or sync until you unsuspend them. Their data is not touched."
        confirmLabel="Suspend"
        destructive
        reason={{ minLength: 5 }}
        onConfirm={async ({ reason }) => {
          await adminSetSuspended(userId, true, reason);
          await refresh();
          await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          notify({ title: "User suspended" });
        }}
      />
      <AdminConfirmDialog
        open={dialog === "unsuspend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Unsuspend this user?"
        description="They can sign in again immediately."
        confirmLabel="Unsuspend"
        reason={{ minLength: 0 }}
        onConfirm={async ({ reason }) => {
          await adminSetSuspended(userId, false, reason);
          await refresh();
          await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          notify({ title: "User unsuspended" });
        }}
      />
      <AdminConfirmDialog
        open={dialog === "reset-data"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Reset user data to fresh onboarding?"
        description={
          <>
            Wipes all transactions, accounts, outings, budgets, and investments for{" "}
            <strong className="text-foreground">{profile.email}</strong>.
            <br className="mt-1" />
            Their <strong className="text-foreground">login credentials (email & password) are preserved</strong>. When they next open the app or log in, they will start fresh from the first-time onboarding screen.
          </>
        }
        confirmLabel="Reset to onboarding"
        destructive
        requirePhrase={profile.email}
        onConfirm={async () => {
          await adminResetUserData(userId);
          notify({ title: "User data reset", description: `Reset ${profile.email} to onboarding.` });
          await refresh();
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
            queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
          ]);
        }}
      />
      <AdminConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Delete this account permanently (including credentials)?"
        description={
          <>
            Permanently deletes the login credentials for <strong className="text-foreground">{profile.email}</strong> and all of their data across all tables.
            They will no longer be able to log in.
          </>
        }
        confirmLabel="Delete permanently"
        destructive
        requirePhrase={profile.email}
        onConfirm={async () => {
          await adminDeleteUser(userId);
          notify({ title: "User deleted", description: profile.email });
          await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          router.replace("/admin/users");
        }}
      />
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
