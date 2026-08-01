"use client";

import { useState } from "react";
import {
  CalendarClock,
  Link2Off,
  Pencil,
  Split,
  Tag,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { ExpenseSplitFlowDiagram } from "@/components/outings/ExpenseSplitFlowDiagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  UnlinkOutingDialog,
  type UnlinkOutingChoice,
} from "@/components/outings/UnlinkOutingDialog";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { getCategoryIcon, getTransactionTypeMeta } from "@/lib/transaction-ui";
import { getCurrentUserMember } from "@/lib/outings";
import { isAutoLinkedOutingTransaction } from "@/lib/outing-sync";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Outing, OutingExpense } from "@/types";

type OutingExpenseDetailSheetProps = {
  expense: OutingExpense | null;
  outing: Outing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: OutingExpense) => void;
  onDelete: (expense: OutingExpense) => void;
  /** Shown only for an automatically linked ledger row — keeps the
   * transaction and drops just the trip link. */
  onUnlink?: (expense: OutingExpense, choice: UnlinkOutingChoice) => void;
};

export function OutingExpenseDetailSheet({
  expense,
  outing,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onUnlink,
}: OutingExpenseDetailSheetProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  if (!expense) return null;

  const typeMeta = getTransactionTypeMeta("expense");
  const CategoryIcon = getCategoryIcon(expense.category);
  const payer = outing.members.find((member) => member.id === expense.paidByMemberId);
  const currentMember = getCurrentUserMember(outing.members);
  const yourShare =
    expense.splits.find((split) => split.memberId === currentMember?.id)?.amount ?? 0;
  const isSharedSplit =
    expense.splitType !== "solo" && expense.splits.length > 1;

  // Only an automatically linked spend offers Unlink — a manual trip expense
  // has no ledger row to fall back to, so Delete is its only exit.
  const canUnlink = isAutoLinkedOutingTransaction(outing, expense);

  function handleConfirmDelete() {
    setDeleteConfirmOpen(false);
    if (expense) onDelete(expense);
  }

  function handleConfirmUnlink(choice: UnlinkOutingChoice) {
    setUnlinkDialogOpen(false);
    if (expense) onUnlink?.(expense, choice);
  }

  const detailRows = [
    { icon: Tag, label: "Category", value: expense.category },
    {
      icon: CalendarClock,
      label: "Expense date",
      value: formatDateTime(expense.date),
    },
    {
      icon: Wallet,
      label: "Account",
      value: expense.accountName
        ? `${expense.accountName}${expense.paymentMode ? ` · ${expense.paymentMode}` : ""}`
        : expense.paymentMode || "—",
    },
    { icon: UserRound, label: "Paid by", value: payer?.name ?? "Unknown" },
    { icon: UserRound, label: "Your share", value: formatCurrency(yourShare) },
    {
      icon: Split,
      label: "Split mode",
      value: expense.splitType === "equally" ? "Split" : expense.splitType,
      capitalize: true,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <div
          className={cn(
            "border-b bg-gradient-to-br px-6 pb-5 pt-6",
            typeMeta.accent.preview,
            typeMeta.accent.border,
          )}
        >
          <SheetHeader className="p-0 text-left">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  typeMeta.accent.icon,
                )}
              >
                <CategoryIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl">{expense.description}</SheetTitle>
                <SheetDescription className="mt-1">{outing.name}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-4 rounded-xl border bg-card/80 p-4 backdrop-blur-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Amount
            </p>
            <p className="mt-1 text-3xl font-semibold text-foreground">
              {formatCurrency(expense.amount)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{expense.source === "bank-detected" ? "Bank-detected" : "Manual"}</Badge>
              {expense.linkedTransactionId ? (
                <Badge variant="outline">Linked to ledger</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5">
          <ExpenseSplitFlowDiagram expense={expense} members={outing.members} />

          {detailRows.map(({ icon: Icon, label, value, capitalize }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3"
            >
              <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-3.5" />
                {label}
              </dt>
              <dd className={cn("text-right text-sm font-medium", capitalize && "capitalize")}>
                {value}
              </dd>
            </div>
          ))}

          {expense.createdAt ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3">
              <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="size-3.5" />
                Added at
              </dt>
              <dd className="text-right text-sm font-medium">
                {formatDateTime(expense.createdAt)}
              </dd>
            </div>
          ) : null}
        </div>

        <SheetFooter className="flex-col gap-2 border-t px-6 py-4 sm:flex-col">
          {onUnlink && canUnlink ? (
            <Button
              className="w-full"
              type="button"
              variant="outline"
              onClick={() => setUnlinkDialogOpen(true)}
            >
              <Link2Off className="size-4" />
              Unlink
            </Button>
          ) : null}
          <div className="flex w-full gap-2">
            <Button className="flex-1" variant="outline" onClick={() => onEdit(expense)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              className="flex-1"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        itemLabel="Expense"
        description={
          isSharedSplit
            ? `Are you sure you want to delete this expense? It is split across ${expense.splits.length} members, so everyone's shares and this outing's settlement balances will change.`
            : "Are you sure you want to delete this expense?"
        }
        detail={`${expense.description} \u00b7 ${formatCurrency(expense.amount)}`}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleConfirmDelete}
      />

      <UnlinkOutingDialog
        open={unlinkDialogOpen}
        outingName={outing.name}
        onConfirm={handleConfirmUnlink}
        onOpenChange={setUnlinkDialogOpen}
      />
    </Sheet>
  );
}
