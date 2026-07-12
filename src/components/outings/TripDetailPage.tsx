"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  MapPin,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AddOutingExpenseDialog } from "@/components/outings/AddOutingExpenseDialog";
import { OutingAnalysisPanel } from "@/components/outings/OutingAnalysisPanel";
import { OutingExpenseList } from "@/components/outings/OutingExpenseList";
import { OutingMembersPanel } from "@/components/outings/OutingMembersPanel";
import { OutingRollupPromptDialog } from "@/components/outings/OutingRollupPromptDialog";
import { SettlementHistoryPanel } from "@/components/outings/SettlementHistoryPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useOutingExpenses } from "@/hooks/useOutingExpenses";
import { useOutingSettlements } from "@/hooks/useOutingSettlements";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import {
  formatOutingDates,
  getCategoryColor,
  getOutingStatusLabel,
} from "@/lib/outing-display";
import {
  buildExpenseSplits,
  buildOutingRollupDraft,
  computeMemberBalances,
  computeTripSummary,
  getCurrentUserMember,
  getMemberPaidAndShare,
  hasOutingRollupTransaction,
  simplifyDebts,
} from "@/lib/outings";
import { PERSONAL_PURPOSE_ID } from "@/lib/purposes";
import { cn, formatCurrency } from "@/lib/utils";
import type { Outing, OutingExpense, Transaction } from "@/types";

type TripDetailPageProps = {
  outing: Outing;
  isLoading?: boolean;
  onUpdate: (outing: Outing) => Promise<unknown>;
  onNotify?: (message: { title: string; description?: string }) => void;
};

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatCurrency(value)}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function TripDetailPage({
  outing,
  isLoading,
  onUpdate,
  onNotify,
}: TripDetailPageProps) {
  const { transactions, addTransaction } = useTransactions();
  const { accounts } = useAccounts();
  const {
    expenses,
    isLoading: expensesLoading,
    addExpense,
    removeExpense,
  } = useOutingExpenses(outing.id);
  const { settlements, addSettlement } = useOutingSettlements(outing.id);

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<OutingExpense | null>(null);
  const [pendingSettle, setPendingSettle] = useState<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amount: number;
    youAreOwed: boolean;
  } | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState("");
  const [rollupPromptOpen, setRollupPromptOpen] = useState(false);
  const [rollupSlideOpen, setRollupSlideOpen] = useState(false);
  const [rollupDraft, setRollupDraft] = useState<Transaction | null>(null);

  const currentMember = getCurrentUserMember(outing.members);
  const summary = useMemo(
    () => computeTripSummary(outing, expenses, settlements),
    [outing, expenses, settlements],
  );
  const balances = useMemo(
    () => computeMemberBalances(outing.members, expenses, settlements),
    [outing.members, expenses, settlements],
  );
  const debtEdges = useMemo(() => simplifyDebts(balances), [balances]);
  const personal = useMemo(
    () =>
      currentMember
        ? getMemberPaidAndShare(currentMember.id, expenses)
        : { paid: 0, share: 0 },
    [currentMember, expenses],
  );
  const netBalance =
    balances.find((item) => item.member.id === currentMember?.id)?.balance ?? 0;

  const individualReturns = useMemo(() => {
    if (!currentMember) return [];
    return debtEdges
      .filter(
        (edge) =>
          edge.fromId === currentMember.id || edge.toId === currentMember.id,
      )
      .map((edge) => {
        if (edge.toId === currentMember.id) {
          return {
            memberId: edge.fromId,
            name: edge.fromName,
            amount: edge.amount,
            youAreOwed: true,
          };
        }
        return {
          memberId: edge.toId,
          name: edge.toName,
          amount: edge.amount,
          youAreOwed: false,
        };
      });
  }, [currentMember, debtEdges]);

  const linkedIds = new Set(
    expenses
      .map((expense) => expense.linkedTransactionId)
      .filter(Boolean) as string[],
  );

  const bankDetected = useMemo(() => {
    const start = new Date(outing.startDate).getTime();
    const end = outing.endDate
      ? new Date(`${outing.endDate}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;

    return transactions.filter((transaction) => {
      if (transaction.type !== "expense") return false;
      if (linkedIds.has(transaction.id)) return false;
      const date = new Date(transaction.date).getTime();
      const inRange = date >= start && date <= end;
      const isDetected =
        transaction.source === "bank-sync" || transaction.source === "mobile";
      return inRange && isDetected;
    });
  }, [transactions, outing, linkedIds]);

  const hasBudget = (outing.budget ?? 0) > 0;
  const budgetProgress = hasBudget
    ? Math.min((summary.totalSpent / outing.budget!) * 100, 100)
    : 0;
  const isBudgetExceeded = hasBudget && summary.totalSpent > outing.budget!;

  async function handleAddExpense(values: {
    description: string;
    amount: number;
    category: string;
    paidByMemberId: string;
    splitType: OutingExpense["splitType"];
    date: string;
  }) {
    const splits = buildExpenseSplits(
      values.amount,
      values.splitType,
      outing.members,
      values.paidByMemberId,
      outing.members.map((member) => member.id),
    );

    await addExpense({
      outingId: outing.id,
      description: values.description,
      amount: values.amount,
      category: values.category,
      date: values.date,
      paidByMemberId: values.paidByMemberId,
      splitType: values.splitType,
      splits,
      source: "manual",
    });

    onNotify?.({
      title: "Expense added",
      description: "Split updated for all members.",
    });
  }

  async function handleLinkTransaction(transaction: (typeof transactions)[number]) {
    const paidByMemberId =
      currentMember?.id ?? outing.members[0]?.id ?? "";
    const splits = buildExpenseSplits(
      transaction.amount,
      "equally",
      outing.members,
      paidByMemberId,
      outing.members.map((member) => member.id),
    );

    await addExpense({
      outingId: outing.id,
      description: transaction.merchant,
      amount: transaction.amount,
      category: transaction.category,
      date: transaction.date.slice(0, 10),
      paidByMemberId,
      splitType: "equally",
      splits,
      source: "bank-detected",
      linkedTransactionId: transaction.id,
    });

    onNotify?.({
      title: "Expense linked",
      description: "Bank-detected transaction added to this outing.",
    });
  }

  async function handleConfirmSettlement() {
    if (!pendingSettle) return;
    const finalAmount = Number(settleAmountInput) || pendingSettle.amount;
    if (finalAmount <= 0) return;

    const settlementDate = new Date().toISOString().slice(0, 10);
    const fromId = pendingSettle.fromMemberId;
    const toId = pendingSettle.toMemberId;

    await addSettlement({
      outingId: outing.id,
      fromMemberId: fromId,
      toMemberId: toId,
      amount: finalAmount,
      date: settlementDate,
    });

    const defaultAccount = accounts[0]?.name ?? "Cash";
    await addTransaction({
      type: "expense",
      amount: finalAmount,
      merchant: `Settlement: ${pendingSettle.fromName} → ${pendingSettle.toName}`,
      category: "Settlements",
      account: defaultAccount,
      purpose: PERSONAL_PURPOSE_ID,
      source: "manual",
      date: settlementDate,
      note: `Outing settlement for ${outing.name}`,
      outingId: outing.id,
    });

    setPendingSettle(null);
    setSettleAmountInput("");
    onNotify?.({
      title: "Settlement recorded",
      description: "Trip balance and transactions updated.",
    });

    if (
      summary.yourShare > 0 &&
      !hasOutingRollupTransaction(transactions, outing.id)
    ) {
      setRollupDraft(
        buildOutingRollupDraft(
          outing,
          summary.yourShare,
          defaultAccount,
          expenses[0]?.category ?? "",
        ) as Transaction,
      );
      setRollupPromptOpen(true);
    }
  }

  function handleRollupConfirm() {
    setRollupPromptOpen(false);
    if (rollupDraft) setRollupSlideOpen(true);
  }

  async function handleRollupSubmit(values: Omit<Transaction, "id">) {
    await addTransaction(values);
    setRollupSlideOpen(false);
    setRollupDraft(null);
    onNotify?.({
      title: "Outing logged",
      description: "Your share now appears in Dashboard and Analytics.",
    });
  }

  async function handleEndTrip() {
    await onUpdate({
      ...outing,
      status: "completed",
      endDate: new Date().toISOString().slice(0, 10),
    });
    onNotify?.({
      title: "Outing completed",
      description: `${outing.name} marked as completed.`,
    });
  }

  if (isLoading || expensesLoading) {
    return <Skeleton className="h-[600px] rounded-xl" />;
  }

  const accent = getCategoryColor(outing.category);
  const dates = formatOutingDates(outing);

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
              href="/outings"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight break-words capitalize sm:text-2xl">
                  {outing.name}
                </h1>
                <Badge
                  className="shrink-0 border-0 text-[10px]"
                  style={{ backgroundColor: accent }}
                >
                  {outing.category ?? "Trip"}
                </Badge>
              </div>
              <div className="flex flex-col gap-x-4 gap-y-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap">
                {dates ? (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5 shrink-0" />
                    {dates}
                  </span>
                ) : null}
                {outing.location ? (
                  <span className="flex items-center gap-1 break-words">
                    <MapPin className="size-3.5 shrink-0" />
                    {outing.location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pl-11 sm:pl-0">
            <Badge variant={outing.status === "active" ? "default" : "secondary"}>
              {getOutingStatusLabel(outing)}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              {outing.status === "active" ? (
                <Button variant="outline" onClick={() => void handleEndTrip()}>
                  <CheckCircle2 className="size-4" />
                  Mark completed
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          label="Total spent"
          subtitle={
            hasBudget ? `Budget: ${formatCurrency(outing.budget!)}` : undefined
          }
          value={summary.totalSpent}
        />
        <MetricCard label="You paid" value={personal.paid} />
        <MetricCard label="Your share" value={personal.share} />
        <MetricCard
          label="Net balance"
          subtitle={
            netBalance > 0.01
              ? "You are owed"
              : netBalance < -0.01
                ? "You owe"
                : "All settled"
          }
          value={Math.abs(netBalance)}
        />
      </div>

      {hasBudget ? (
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium text-foreground">Budget progress</span>
            <span
              className={cn(
                isBudgetExceeded ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatCurrency(summary.totalSpent)} / {formatCurrency(outing.budget!)}
            </span>
          </div>
          <Progress value={budgetProgress}>
            <ProgressTrack className="h-2">
              <ProgressIndicator
                className={cn(isBudgetExceeded && "bg-destructive")}
              />
            </ProgressTrack>
          </Progress>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Expenses & settlements</h2>
          <p className="text-sm text-muted-foreground">
            Balances, bank sync, and shared costs
          </p>
        </div>
        <Button
          className="w-full shrink-0 gap-2 sm:w-auto"
          variant={isBudgetExceeded ? "destructive" : "default"}
          onClick={() => setAddExpenseOpen(true)}
        >
          <Plus size={16} />
          Add expense
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OutingAnalysisPanel
          expenses={expenses}
          outing={outing}
          totalSpent={summary.totalSpent}
        />
        <OutingMembersPanel
          balances={balances}
          expenses={expenses}
          outing={outing}
        />
      </div>

      <div className="rounded-2xl border bg-card p-6">
            <h3 className="mb-1 font-semibold text-foreground">Individual returns</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              Who owes whom in this outing
            </p>
            {individualReturns.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                All balances are settled!
              </p>
            ) : (
              <div className="space-y-3">
                {individualReturns.map((item) => (
                  <div
                    key={item.memberId}
                    className={cn(
                      "rounded-xl border p-3",
                      item.youAreOwed
                        ? "border-success/20 bg-success/5"
                        : "border-destructive/20 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm leading-tight font-medium text-foreground sm:text-base">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {item.youAreOwed
                              ? `${item.name} owes you`
                              : `You owe ${item.name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "text-sm leading-none font-bold tabular-nums sm:text-base",
                            item.youAreOwed ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatCurrency(item.amount)}
                        </span>
                        <Button
                          className={cn(
                            "h-7 gap-1 rounded-md px-3 text-[11px] font-bold",
                            item.youAreOwed &&
                              "border-success/30 text-success hover:bg-success/5 hover:text-success",
                          )}
                          variant={item.youAreOwed ? "outline" : "default"}
                          onClick={() => {
                            setPendingSettle({
                              fromMemberId: item.youAreOwed
                                ? item.memberId
                                : currentMember?.id ?? "",
                              toMemberId: item.youAreOwed
                                ? currentMember?.id ?? ""
                                : item.memberId,
                              fromName: item.youAreOwed ? item.name : "You",
                              toName: item.youAreOwed ? "You" : item.name,
                              amount: item.amount,
                              youAreOwed: item.youAreOwed,
                            });
                            setSettleAmountInput(item.amount.toString());
                          }}
                        >
                          {item.youAreOwed ? (
                            <ArrowDownLeft className="size-3.5" />
                          ) : (
                            <Wallet className="size-3.5" />
                          )}
                          {item.youAreOwed ? "Return" : "Settle"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h3 className="mb-1 font-semibold text-foreground">
          Return & settle statement
        </h3>
        <p className="mb-5 text-sm text-muted-foreground">
          Payment history with friends in this outing
        </p>
        <SettlementHistoryPanel outing={outing} records={settlements} />
      </div>

      {bankDetected.length > 0 ? (
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="mb-4 font-semibold text-foreground">
            Bank-detected expenses
          </h3>
          <div className="space-y-2">
            {bankDetected.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{transaction.merchant}</p>
                  <p className="text-xs text-muted-foreground">
                    {transaction.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatCurrency(transaction.amount)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => void handleLinkTransaction(transaction)}
                  >
                    Link
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">All expenses</h3>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {expenses.length === 0 ? (
            <EmptyState
              actionLabel="Add expense"
              description="Add your first expense to start tracking who paid what."
              icon={Receipt}
              title="No expenses yet"
              onAction={() => setAddExpenseOpen(true)}
            />
          ) : (
            <OutingExpenseList
              expenses={expenses}
              outing={outing}
              onSelect={setSelectedExpense}
            />
          )}
        </div>
      </div>

      <AddOutingExpenseDialog
        open={addExpenseOpen}
        outing={outing}
        onOpenChange={setAddExpenseOpen}
        onSubmit={handleAddExpense}
      />

      <Dialog
        open={!!selectedExpense}
        onOpenChange={(open) => !open && setSelectedExpense(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expense details</DialogTitle>
            <DialogDescription>
              {selectedExpense?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedExpense ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">
                  {formatCurrency(selectedExpense.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{selectedExpense.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Split</span>
                <span className="capitalize">{selectedExpense.splitType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize">{selectedExpense.source}</span>
              </div>
              <Button
                className="w-full text-destructive"
                variant="outline"
                onClick={() => {
                  void removeExpense(selectedExpense.id);
                  setSelectedExpense(null);
                  onNotify?.({ title: "Expense removed" });
                }}
              >
                <Trash2 className="size-4" />
                Delete expense
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingSettle}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSettle(null);
            setSettleAmountInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record settlement</DialogTitle>
            <DialogDescription>
              {pendingSettle?.youAreOwed
                ? `Record money received from ${pendingSettle.toName}`
                : `Record payment to ${pendingSettle?.toName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="decimal"
                value={settleAmountInput}
                onChange={(event) => setSettleAmountInput(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingSettle(null)}>
                Cancel
              </Button>
              <Button onClick={() => void handleConfirmSettlement()}>
                Record settlement
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <OutingRollupPromptDialog
        open={rollupPromptOpen}
        outingName={outing.name}
        yourShare={summary.yourShare}
        onConfirm={handleRollupConfirm}
        onOpenChange={setRollupPromptOpen}
      />

      <AddTransactionSlideOver
        initialValues={rollupDraft ?? undefined}
        mode="expense"
        open={rollupSlideOpen}
        onOpenChange={(open) => {
          setRollupSlideOpen(open);
          if (!open) setRollupDraft(null);
        }}
        onSubmit={handleRollupSubmit}
      />
    </div>
  );
}