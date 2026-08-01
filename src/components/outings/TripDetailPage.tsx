"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddTransactionSlideOver } from "@/components/shared/AddTransactionSlideOver";
import { CreateOutingModal } from "@/components/outings/CreateOutingModal";
import { OutingAnalysisPanel } from "@/components/outings/OutingAnalysisPanel";
import { OutingExpenseDetailSheet } from "@/components/outings/OutingExpenseDetailSheet";
import type { UnlinkOutingChoice } from "@/components/outings/UnlinkOutingDialog";
import { OutingExpenseList } from "@/components/outings/OutingExpenseList";
import { OutingMembersPanel } from "@/components/outings/OutingMembersPanel";
import { RecordSettlementDialog } from "@/components/outings/RecordSettlementDialog";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { memberDisplayName } from "@/lib/settlements";
import { useDeletedFriends } from "@/hooks/useDeletedFriends";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useFriends } from "@/hooks/useFriends";
import { useOutingExpenses } from "@/hooks/useOutingExpenses";
import { useOutingSettlements } from "@/hooks/useOutingSettlements";
import { useOutings } from "@/hooks/useOutings";
import { useTransactions } from "@/hooks/useTransactions";
import {
  formatOutingDates,
  getCategoryColor,
  getOutingStatusLabel,
} from "@/lib/outing-display";
import { buildOutingReport, outingExpensesToCsv } from "@/lib/outing-reports";
import { withOutingUnlinkedTag } from "@/lib/outing-sync";
import {
  buildExpenseSplits,
  buildOutingRollupDraft,
  computeMemberBalances,
  computeOutingUserPaidAmount,
  computeTripSummary,
  findAllOutingRollupTransactions,
  findOutingRollupTransaction,
  getCurrentUserMember,
  getMemberPaidAndShare,
  latestOutingExpenseDate,
  simplifyDebts,
} from "@/lib/outings";
import { downloadReportPdf } from "@/lib/pdf";
import { cn, downloadCsv, formatCurrency } from "@/lib/utils";
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
  tone,
}: {
  label: string;
  value: number;
  subtitle?: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="sx-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
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
  const router = useRouter();
  const { user } = useAuthReady();
  const { accounts } = useAccounts();
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions();
  const { friends } = useFriends();
  const { deletedFriendIds } = useDeletedFriends();
  const { removeOuting } = useOutings();
  const {
    expenses,
    isLoading: expensesLoading,
    addExpense,
    removeExpense,
  } = useOutingExpenses(outing.id);
  const { settlements } = useOutingSettlements(outing.id);

  const defaultAccountName =
    accounts.find((account) => account.isDefault)?.name ??
    accounts[0]?.name ??
    "Cash";

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OutingExpense | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<OutingExpense | null>(null);
  /** Set by "Unlink → Convert to Split Transaction": the freshly unlinked
   * ledger row, reopened in the Split Expense form. */
  const [convertingTransaction, setConvertingTransaction] =
    useState<Transaction | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [expenseFilter, setExpenseFilter] = useState<
    "all" | "automatic" | "manual" | "solo" | "split"
  >("all");
  const [pendingSettle, setPendingSettle] = useState<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amount: number;
    youAreOwed: boolean;
  } | null>(null);
  const [editOutingOpen, setEditOutingOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [endTripConfirmOpen, setEndTripConfirmOpen] = useState(false);
  const [showSettlementSummary, setShowSettlementSummary] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const healedRollupRef = useRef<string | null>(null);

  const currentMember = getCurrentUserMember(outing.members);
  const viewerCreatedOuting = Boolean(user?.id && outing.createdBy === user.id);
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

  const bankDetected = useMemo(() => {
    const linkedIds = new Set(
      expenses
        .map((expense) => expense.linkedTransactionId)
        .filter(Boolean) as string[],
    );
    const start = new Date(outing.startDate).getTime();
    const end = outing.endDate
      ? new Date(`${outing.endDate}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;

    return transactions.filter((transaction) => {
      if (transaction.type !== "expense") return false;
      if (linkedIds.has(transaction.id)) return false;
      const date = new Date(
        transaction.transactionDate ?? transaction.date ?? "",
      ).getTime();
      const inRange = date >= start && date <= end;
      const isDetected =
        transaction.source === "bank-sync" || transaction.source === "mobile";
      return inRange && isDetected;
    });
  }, [transactions, outing, expenses]);

  const hasSoloExpenses = useMemo(
    () => expenses.some((expense) => expense.splitType === "solo"),
    [expenses],
  );

  const visibleExpenses = useMemo(() => {
    let list = expenses;
    if (selectedMemberId) {
      list = list.filter(
        (expense) =>
          expense.paidByMemberId === selectedMemberId ||
          expense.splits.some((split) => split.memberId === selectedMemberId),
      );
    }
    if (expenseFilter === "automatic") {
      list = list.filter((expense) => expense.source === "bank-detected");
    } else if (expenseFilter === "manual") {
      list = list.filter((expense) => expense.source === "manual");
    } else if (expenseFilter === "solo") {
      list = list.filter((expense) => expense.splitType === "solo");
    } else if (expenseFilter === "split") {
      list = list.filter((expense) => expense.splitType !== "solo");
    }
    return list;
  }, [expenses, selectedMemberId, expenseFilter]);

  const returnedAmount = useMemo(() => {
    if (!currentMember) return 0;
    return settlements
      .filter((settlement) => settlement.toMemberId === currentMember.id)
      .reduce((sum, settlement) => sum + settlement.amount, 0);
  }, [settlements, currentMember]);

  const autoManualStats = useMemo(() => {
    const auto = expenses.filter((expense) => expense.source === "bank-detected");
    const manual = expenses.filter((expense) => expense.source === "manual");
    let manualCash = 0;
    let manualAccount = 0;
    if (currentMember) {
      for (const expense of manual) {
        const yourSplit = expense.splits.find(
          (split) => split.memberId === currentMember.id,
        );
        if (!yourSplit) continue;
        if (expense.paymentMode === "Cash") {
          manualCash += yourSplit.amount;
        } else {
          manualAccount += yourSplit.amount;
        }
      }
    }
    return {
      autoCount: auto.length,
      autoAmount: auto.reduce((sum, expense) => sum + expense.amount, 0),
      manualAmount: manual.reduce((sum, expense) => sum + expense.amount, 0),
      manualCash,
      manualAccount,
    };
  }, [expenses, currentMember]);

  const hasBudget = (outing.budget ?? 0) > 0;
  const budgetProgress = hasBudget
    ? Math.min((summary.totalSpent / outing.budget!) * 100, 100)
    : 0;
  const isBudgetExceeded = hasBudget && summary.totalSpent > outing.budget!;

  /**
   * Keep ONE personal-ledger row for this outing:
   * merchant = outing name (e.g. "Goa Trip"), amount = what THIS user paid
   * (a friend's payment is not your expense). Individual outing expenses are
   * hidden on the Transactions page.
   */
  async function syncOutingRollup(nextExpenses: OutingExpense[]) {
    const amount = computeOutingUserPaidAmount(
      outing,
      nextExpenses,
      transactions,
      outing.id,
    );
    const allRollups = findAllOutingRollupTransactions(transactions, outing.id);
    const existing =
      allRollups.sort(
        (a, b) =>
          new Date(b.transactionDate ?? b.date ?? 0).getTime() -
          new Date(a.transactionDate ?? a.date ?? 0).getTime(),
      )[0] ?? findOutingRollupTransaction(transactions, outing.id);

    // Remove duplicate rollup rows so totals don't show 2× / 3×.
    for (const extra of allRollups) {
      if (existing && extra.id === existing.id) continue;
      try {
        await deleteTransaction(extra.id);
      } catch {
        // Best-effort cleanup.
      }
    }

    const category =
      nextExpenses.find((item) => item.category)?.category || "Travel";
    const payload = buildOutingRollupDraft(
      outing,
      amount,
      defaultAccountName,
      category,
      latestOutingExpenseDate(nextExpenses),
    );

    if (amount <= 0) {
      if (existing) {
        try {
          await deleteTransaction(existing.id);
        } catch {
          // Ignore cleanup failures; outing expenses already saved.
        }
      }
      return;
    }

    if (existing) {
      await updateTransaction({
        id: existing.id,
        transaction: payload,
      });
      return;
    }

    await addTransaction(payload);
  }

  // Heal missing/stale rollup when opening a trip (e.g. expenses added on mobile).
  useEffect(() => {
    if (expensesLoading || isLoading) return;
    if (expenses.length === 0) return;
    const signature = `${outing.id}:${expenses.length}:${expenses
      .map((e) => `${e.id}:${e.amount}`)
      .join("|")}`;
    if (healedRollupRef.current === signature) return;
    healedRollupRef.current = signature;
    void syncOutingRollup(expenses).catch(() => {
      // Background heal — user can still add/edit expenses to force sync.
      healedRollupRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heal on expense/tx snapshot change
  }, [expenses, expensesLoading, isLoading, outing.id, transactions.length]);


  async function handleDeleteExpense(expense: OutingExpense) {
    // If this outing expense is linked to a ledger transaction, clear the
    // outing tag so the spend reappears on Transactions (not hidden forever).
    // Mark opt-out so active auto-add does not re-attach immediately.
    if (expense.linkedTransactionId) {
      const linked = transactions.find(
        (tx) => tx.id === expense.linkedTransactionId,
      );
      if (linked) {
        try {
          await updateTransaction({
            id: linked.id,
            transaction: {
              outingId: null,
              tags: withOutingUnlinkedTag(linked.tags),
            },
          });
        } catch {
          // Still remove the outing expense below.
        }
      }
    }

    await removeExpense(expense.id);
    const nextExpenses = expenses.filter((item) => item.id !== expense.id);
    await syncOutingRollup(nextExpenses);
    onNotify?.({
      title: expense.linkedTransactionId
        ? "Unlinked from outing"
        : "Expense removed",
      description: expense.linkedTransactionId
        ? "Transaction is back on your ledger without the trip tag."
        : undefined,
    });
  }

  /**
   * Keep the ledger row; drop only the outing link + outing expense. Both
   * unlink choices do the same thing — "split" additionally reopens the now
   * plain transaction in the Split Expense form, which updates that same row
   * rather than creating a new transaction or a new outing.
   */
  async function handleUnlinkExpense(
    expense: OutingExpense,
    choice: UnlinkOutingChoice = "normal",
  ) {
    const linked = expense.linkedTransactionId
      ? transactions.find((tx) => tx.id === expense.linkedTransactionId)
      : undefined;

    await handleDeleteExpense(expense);
    setSelectedExpense(null);

    if (choice === "split" && linked) {
      setConvertingTransaction({
        ...linked,
        outingId: null,
        tags: withOutingUnlinkedTag(linked.tags),
      });
    }
  }

  async function handleLinkTransaction(transaction: Transaction) {
    const paidByMemberId =
      currentMember?.id ?? outing.members[0]?.id ?? "";
    const splits = buildExpenseSplits(
      transaction.amount,
      "equally",
      outing.members,
      paidByMemberId,
      outing.members.map((member) => member.id),
    );

    const saved = await addExpense({
      outingId: outing.id,
      description: transaction.merchant,
      amount: transaction.amount,
      category: transaction.category,
      date: (transaction.transactionDate ?? transaction.date ?? "").slice(0, 10),
      paidByMemberId,
      splitType: "equally",
      splits,
      source: "bank-detected",
      linkedTransactionId: transaction.id,
    });

    // Tag the existing bank row with this outing (click → outing details).
    // Also adopts the outing's Purpose, so the user isn't asked to pick one.
    if (!transaction.outingId) {
      try {
        await updateTransaction({
          id: transaction.id,
          transaction: {
            outingId: outing.id,
            ...(outing.purposeId ? { purposeId: outing.purposeId } : {}),
          },
        });
      } catch {
        // Linking the outing expense is enough; outing tag is best-effort.
      }
    }

    await syncOutingRollup([
      saved,
      ...expenses.filter((item) => item.id !== saved.id),
    ]);

    onNotify?.({
      title: "Expense linked",
      description: "Bank-detected transaction added to this outing.",
    });
  }

  async function handleEndTrip() {
    await onUpdate({
      ...outing,
      status: "completed",
      isActive: false,
      endDate: new Date().toISOString().slice(0, 10),
    });
    onNotify?.({
      title: "Outing completed",
      description: `${outing.name} marked as completed. You can start a new trip.`,
    });
  }

  async function handleEditOutingSubmit(
    values: Omit<Outing, "id" | "userId" | "createdAt" | "updatedAt">,
  ) {
    const updated = { ...outing, ...values };
    await onUpdate(updated);
    // Refresh the single ledger line name if the outing was renamed.
    const existing = findOutingRollupTransaction(transactions, outing.id);
    if (existing) {
      const amount = computeOutingUserPaidAmount(
        updated,
        expenses,
        transactions,
        outing.id,
      );
      if (amount > 0) {
        await updateTransaction({
          id: existing.id,
          transaction: buildOutingRollupDraft(
            updated,
            amount,
            defaultAccountName,
            expenses[0]?.category || existing.category || "Travel",
            latestOutingExpenseDate(expenses),
          ),
        });
      }
    }
    onNotify?.({ title: "Outing updated" });
  }

  async function handleConfirmDelete() {
    // Cascade: outing + its transactions + outing_expenses + settlements are
    // all soft-deleted atomically (cascade_delete_outing RPC) — restorable
    // anytime from Settings > Data & Backups.
    await removeOuting(outing.id);
    setDeleteConfirmOpen(false);
    onNotify?.({
      title: "Outing deleted successfully.",
      description: "Outing and its linked spends were removed. Restore anytime from Settings.",
    });
    router.push("/outings");
  }

  async function handleCompleteOuting() {
    setCompleteConfirmOpen(false);
    setShowSettlementSummary(false);
    await onUpdate({
      ...outing,
      status: "completed",
      isActive: false,
    });
    onNotify?.({
      title: "Outing Completed",
      description: "All settlements recorded and trip marked as completed.",
    });
  }

  async function handleArchiveOuting() {
    setArchiveConfirmOpen(false);
    setShowSettlementSummary(false);
    await onUpdate({
      ...outing,
      status: "archived",
      isActive: false,
    });
    onNotify?.({
      title: "Outing Archived",
      description: "Outing has been moved to archived list.",
    });
  }

  async function handleCancelOuting() {
    setCancelConfirmOpen(false);
    setShowSettlementSummary(false);
    await onUpdate({
      ...outing,
      status: "cancelled",
      isActive: false,
    });
    onNotify?.({
      title: "Outing Cancelled",
      description: "Outing cancelled. Expenses and settlements preserved for history.",
    });
  }

  function handleExportCsv() {
    downloadCsv(`${outing.name}-expenses.csv`, outingExpensesToCsv(expenses));
  }

  function handleExportPdf() {
    const report = buildOutingReport(outing, expenses, summary);
    downloadReportPdf(report);
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
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {getOutingStatusLabel(outing)}
              </p>
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
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {outing.members.map((member) => (
                  <span
                    key={member.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-foreground"
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[9px]">
                        {member.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {memberDisplayName(member, deletedFriendIds)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
            {outing.status === "active" && !showSettlementSummary ? (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                onClick={() => setEndTripConfirmOpen(true)}
              >
                <CheckCircle2 className="size-4 mr-1" />
                End Trip & Settle
              </Button>
            ) : null}
            {outing.status === "completed" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setArchiveConfirmOpen(true)}
              >
                Archive Outing
              </Button>
            ) : null}
            {outing.status === "active" || outing.status === "completed" ? (
              <Button size="sm" variant="outline" onClick={() => setEditOutingOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleExportPdf}>
              PDF
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv}>
              CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {showSettlementSummary ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-primary/10 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{outing.name} — Settlement Summary</h2>
              <p className="text-xs text-muted-foreground mt-1">Review member balances and pending settlements before finalizing the outing.</p>
            </div>
            <Badge variant="outline" className="bg-background text-sm font-semibold py-1 px-3 self-start sm:self-auto">
              Total Expense: {formatCurrency(summary.totalSpent)}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Total Paid by Each Member */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Paid by Each Member</h3>
              <div className="space-y-2">
                {outing.members.map((member) => {
                  const memberPaid = getMemberPaidAndShare(member.id, expenses).paid;
                  return (
                    <div key={member.id} className="flex items-center justify-between rounded-xl border bg-background p-3 text-sm">
                      <span className="font-medium">
                        {memberDisplayName(member, deletedFriendIds)}
                      </span>
                      <span className="tabular-nums font-semibold">{formatCurrency(memberPaid)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Member Balances & Pending Settlements */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Member Balances & Pending Settlements</h3>
              <div className="space-y-2">
                {debtEdges.length === 0 ? (
                  <div className="rounded-xl border bg-background p-3 text-sm text-center text-muted-foreground">
                    All balances settled! (₹0)
                  </div>
                ) : (
                  debtEdges.map((edge, idx) => {
                    const isToYou = edge.toId === currentMember?.id;
                    const isFromYou = edge.fromId === currentMember?.id;
                    let label = `${edge.fromName} owes ${edge.toName}`;
                    if (isToYou) label = `${edge.fromName} owes You`;
                    else if (isFromYou) label = `You owe ${edge.toName}`;

                    return (
                      <div key={idx} className="flex items-center justify-between rounded-xl border bg-background p-3 text-sm">
                        <span className="font-medium">{label}</span>
                        <span className={cn("tabular-nums font-semibold", isToYou ? "text-success" : isFromYou ? "text-destructive" : "")}>
                          {formatCurrency(edge.amount)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Settlement Actions Bar (Web Right-side / Footer actions) */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-primary/10">
            <Button
              variant="outline"
              onClick={() => {
                if (debtEdges.length > 0) {
                  const first = debtEdges[0];
                  setPendingSettle({
                    fromMemberId: first.fromId,
                    toMemberId: first.toId,
                    fromName: first.fromName,
                    toName: first.toName,
                    amount: first.amount,
                    youAreOwed: first.toId === currentMember?.id,
                  });
                } else if (outing.members.length > 1) {
                  const firstFriend = outing.members.find((m) => m.id !== currentMember?.id);
                  if (firstFriend) {
                    setPendingSettle({
                      fromMemberId: firstFriend.id,
                      toMemberId: currentMember?.id ?? "you",
                      fromName: firstFriend.name,
                      toName: "You",
                      amount: 0,
                      youAreOwed: true,
                    });
                  }
                }
              }}
            >
              Record Settlement
            </Button>

            <Button
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => setCompleteConfirmOpen(true)}
            >
              Complete Outing
            </Button>

            <Button
              variant="outline"
              onClick={() => setArchiveConfirmOpen(true)}
            >
              Archive Outing
            </Button>

            <Button
              variant="destructive"
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel Outing
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:gap-4",
          hasBudget ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        <MetricCard label="Total trip spent" value={summary.totalSpent} />
        <MetricCard label="Total your spent" value={personal.paid} />
        <MetricCard
          label="Your return amount"
          subtitle="Pending — still owed to you"
          tone={netBalance > 0 ? "success" : undefined}
          value={Math.max(0, netBalance)}
        />
        <MetricCard
          label="Returned amount"
          subtitle="Already received"
          value={returnedAmount}
        />
        {hasBudget ? (
          <div className="sx-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Budget
            </p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                isBudgetExceeded && "text-destructive",
              )}
            >
              {formatCurrency(outing.budget!)}
            </p>
            <Progress className="mt-2" value={budgetProgress}>
              <ProgressTrack className="h-1.5">
                <ProgressIndicator
                  className={cn(isBudgetExceeded && "bg-destructive")}
                />
              </ProgressTrack>
            </Progress>
            <p
              className={cn(
                "mt-1 text-xs text-muted-foreground",
                isBudgetExceeded && "text-destructive",
              )}
            >
              {formatCurrency(summary.totalSpent)} spent
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="sx-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Automatically detected
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatCurrency(autoManualStats.autoAmount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {autoManualStats.autoCount} transaction
            {autoManualStats.autoCount === 1 ? "" : "s"} · bank-detected
          </p>
        </div>
        <div className="sx-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Manually added
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatCurrency(autoManualStats.manualAmount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your spend — Cash {formatCurrency(autoManualStats.manualCash)} ·
            Account {formatCurrency(autoManualStats.manualAccount)}
          </p>
        </div>
      </div>

      {/* Mobile-style single scroll: members → settle → activity */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Members
        </h2>
        <OutingMembersPanel
          balances={balances}
          expenses={expenses}
          outing={outing}
          selectedMemberId={selectedMemberId}
          viewerCreatedOuting={viewerCreatedOuting}
          onSelectMember={setSelectedMemberId}
        />
      </section>

      {individualReturns.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Settle up
          </h2>
          <div className="space-y-2">
            {individualReturns.map((item) => (
              <div
                key={item.memberId}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl border p-3.5",
                  item.youAreOwed
                    ? "border-success/20 bg-success/5"
                    : "border-destructive/20 bg-destructive/5",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.youAreOwed
                        ? `${item.name} owes you`
                        : `You owe ${item.name}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      item.youAreOwed ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatCurrency(item.amount)}
                  </span>
                  <Button
                    className="h-7 gap-1 px-3 text-[11px] font-bold"
                    size="sm"
                    variant={item.youAreOwed ? "outline" : "default"}
                    onClick={() => {
                      setPendingSettle({
                        fromMemberId: item.youAreOwed
                          ? item.memberId
                          : (currentMember?.id ?? ""),
                        toMemberId: item.youAreOwed
                          ? (currentMember?.id ?? "")
                          : item.memberId,
                        fromName: item.youAreOwed ? item.name : "You",
                        toName: item.youAreOwed ? "You" : item.name,
                        amount: item.amount,
                        youAreOwed: item.youAreOwed,
                      });
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
            ))}
          </div>
        </section>
      ) : null}

      {bankDetected.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Bank-detected
          </h2>
          <div className="space-y-2">
            {bankDetected.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{transaction.merchant}</p>
                  <p className="text-xs text-muted-foreground">
                    {transaction.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(transaction.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleLinkTransaction(transaction)}
                  >
                    Link
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Activity
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {visibleExpenses.length} expense
              {visibleExpenses.length === 1 ? "" : "s"}
              {selectedMemberId ? " · filtered" : ""}
            </p>
          </div>
          <Button
            className="w-full shrink-0 gap-2 sm:w-auto"
            variant={isBudgetExceeded ? "destructive" : "default"}
            onClick={() => {
              setEditingExpense(null);
              setAddExpenseOpen(true);
            }}
          >
            <Plus size={16} />
            Add expense
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "all", label: "All" },
              { key: "automatic", label: "Automatic" },
              { key: "manual", label: "Manual" },
              ...(hasSoloExpenses
                ? [{ key: "solo" as const, label: "Solo" }]
                : []),
              { key: "split", label: "Split" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                expenseFilter === item.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              type="button"
              onClick={() => setExpenseFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
          {selectedMemberId ? (
            <button
              className="rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary"
              type="button"
              onClick={() => setSelectedMemberId(null)}
            >
              Clear member
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {visibleExpenses.length === 0 ? (
            <EmptyState
              actionLabel="Add expense"
              description="Add your first expense to start tracking who paid what."
              icon={Receipt}
              title="No expenses yet"
              onAction={() => {
                setEditingExpense(null);
                setAddExpenseOpen(true);
              }}
            />
          ) : (
            <OutingExpenseList
              expenses={visibleExpenses}
              outing={outing}
              onSelect={setSelectedExpense}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Analysis
        </h2>
        <OutingAnalysisPanel
          balances={balances}
          expenses={expenses}
          outing={outing}
          settlements={settlements}
        />
      </section>

      <AddTransactionSlideOver
        key={editingExpense?.id ?? "new"}
        initialExpense={editingExpense ?? undefined}
        lockedOutingId={outing.id}
        open={addExpenseOpen}
        onOpenChange={(next) => {
          setAddExpenseOpen(next);
          if (!next) setEditingExpense(null);
        }}
      />

      {/* Unlink → "Convert to Split Transaction" lands here: the row is
          already a plain transaction, so this updates it in place. */}
      {convertingTransaction ? (
        <AddTransactionSlideOver
          key={`convert-${convertingTransaction.id}`}
          forceSplitExpense
          initialValues={convertingTransaction}
          mode={convertingTransaction.type}
          open
          onOpenChange={(next) => {
            if (!next) setConvertingTransaction(null);
          }}
          onSubmit={async (values) => {
            await updateTransaction({
              id: convertingTransaction.id,
              transaction: values,
            });
            setConvertingTransaction(null);
            onNotify?.({
              title: "Converted to split transaction",
              description: "It now sits on your ledger with its own splits.",
            });
          }}
        />
      ) : null}

      <OutingExpenseDetailSheet
        expense={selectedExpense}
        open={!!selectedExpense}
        outing={outing}
        onOpenChange={(open) => !open && setSelectedExpense(null)}
        onDelete={(expense) => {
          void handleDeleteExpense(expense).then(() => {
            setSelectedExpense(null);
          });
        }}
        onUnlink={(expense, choice) => {
          void handleUnlinkExpense(expense, choice);
        }}
        onEdit={(expense) => {
          setSelectedExpense(null);
          setEditingExpense(expense);
          setAddExpenseOpen(true);
        }}
      />

      {pendingSettle ? (
        <RecordSettlementDialog
          key={`${outing.id}-${pendingSettle.fromMemberId}-${pendingSettle.toMemberId}`}
          fromMemberId={pendingSettle.fromMemberId}
          fromName={pendingSettle.fromName}
          open={!!pendingSettle}
          outing={outing}
          suggestedAmount={pendingSettle.amount}
          toMemberId={pendingSettle.toMemberId}
          toName={pendingSettle.toName}
          youAreOwed={pendingSettle.youAreOwed}
          onNotify={onNotify}
          onOpenChange={(open) => !open && setPendingSettle(null)}
          onRecorded={() => setPendingSettle(null)}
        />
      ) : null}

      <CreateOutingModal
        key={editOutingOpen ? outing.id : "closed"}
        friends={friends}
        initialValues={outing}
        open={editOutingOpen}
        onOpenChange={setEditOutingOpen}
        onSubmit={handleEditOutingSubmit}
      />

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        itemLabel="Outing"
        description="This will permanently delete the outing and all related expenses, member shares, settlements, and transactions."
        detail={outing.name}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={() => void handleConfirmDelete()}
      />

      {/* End Trip Confirmation Dialog */}
      <Dialog open={endTripConfirmOpen} onOpenChange={setEndTripConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End Trip</DialogTitle>
            <DialogDescription className="text-foreground/90 pt-2 text-sm">
              Are you sure you want to end this outing? Before completing the outing, ensure all expenses and settlements have been recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEndTripConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setEndTripConfirmOpen(false);
                setShowSettlementSummary(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Outing Confirmation Dialog */}
      <Dialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Outing</DialogTitle>
            <DialogDescription className="text-foreground/90 pt-2 text-sm">
              All settlements have been recorded. Complete this outing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCompleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={handleCompleteOuting}>
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Outing Confirmation Dialog */}
      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive Outing</DialogTitle>
            <DialogDescription className="text-foreground/90 pt-2 text-sm">
              Archive this outing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setArchiveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleArchiveOuting}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Outing Confirmation Dialog */}
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Outing</DialogTitle>
            <DialogDescription className="text-foreground/90 pt-2 text-sm">
              This will cancel the outing. Expenses and settlements will be preserved for history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCancelOuting}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
