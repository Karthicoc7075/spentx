"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertCircle,
  Check,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Hash,
  Landmark,
  MapPin,
  Pencil,
  ShoppingBag,
  Split,
  StickyNote,
  Tag,
  Target,
  Trash2,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { isInvestmentTransaction } from "@/lib/investments";
import { isAutoLinkedOutingTransaction } from "@/lib/outing-sync";
import {
  getCategoryIcon,
  getTransactionAmountClass,
  getTransactionTypeMeta,
} from "@/lib/transaction-ui";
import { getPurposeDisplayName } from "@/lib/purposes";
import { useCategories } from "@/hooks/useCategories";
import { useOutings } from "@/hooks/useOutings";
import { useFriendSplits } from "@/hooks/useFriendSplits";
import { usePurposes } from "@/hooks/usePurposes";
import { getCurrentUserMember } from "@/lib/outings";
import { useViewerAccess } from "@/providers/viewer-provider";
import {
  cn,
  formatCurrency,
  formatDateTime,
  splitRowMatchesFilters,
  transactionDateKey,
} from "@/lib/utils";
import type { GlobalFilters, OutingExpense, Transaction } from "@/types";

type TransactionDetailPanelProps = {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onVerify?: (transaction: Transaction) => void;
  onReject?: (transaction: Transaction) => void;
  /** Receives the user's choice from the unlink dialog — "split" additionally
   * expects the caller to open Split Expense on this transaction. */
  onUnlinkOuting?: (
    transaction: Transaction,
    choice: UnlinkOutingChoice,
  ) => Promise<void> | void;
  outingExpenses?: OutingExpense[];
  /** Currently active Purpose/Category filters on the Transactions page —
   * when set, matching Splits rows are highlighted below. */
  activeFilters?: Pick<GlobalFilters, "categories" | "purposeId">;
};

export function TransactionDetailPanel({
  transaction,
  open,
  onOpenChange,
  onDelete,
  onEdit,
  onVerify,
  onReject,
  onUnlinkOuting,
  outingExpenses = [],
  activeFilters,
}: TransactionDetailPanelProps) {
  const { outings } = useOutings();
  const { categories } = useCategories();
  const { purposes } = usePurposes();
  const { isReadOnlyViewer } = useViewerAccess();
  const { splits: friendSplits, settlements: friendSettlements } =
    useFriendSplits();
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

  if (!transaction) return null;

  const linkedExpense = outingExpenses.find(
    (expense) => expense.linkedTransactionId === transaction.id,
  );

  const linkedOuting = transaction.outingId
    ? outings.find(
        (outing) =>
          outing.id === transaction.outingId &&
          outing.isActive !== false &&
          !outing.deletedAt,
      )
    : null;

  // Only a link the system made by itself (SMS / bank sync / import) can be
  // unlinked here — manual links, manual outing expenses and friend splits
  // are undone by editing the transaction instead.
  const canUnlink = isAutoLinkedOutingTransaction(linkedOuting, linkedExpense);

  function handleConfirmUnlink(choice: UnlinkOutingChoice) {
    setUnlinkDialogOpen(false);
    void onUnlinkOuting?.(transaction!, choice);
  }
  const isInvestment = isInvestmentTransaction(transaction, categories);
  const isFriendReturn =
    transaction.type === "income" &&
    (transaction.category?.trim().toLowerCase() === "friend returns" ||
      transaction.category?.trim().toLowerCase() === "friend return" ||
      Boolean(transaction.linkedExpenseId));
  const typeMeta = getTransactionTypeMeta(transaction.type);
  const TypeIcon = typeMeta.icon;
  const CategoryIcon = getCategoryIcon(transaction.category);

  const purposeLabel = getPurposeDisplayName(
    transaction.purposeId ?? transaction.purpose,
    purposes,
  );
  const accountLabel =
    transaction.accountName || transaction.account || "Not set";
  const paymentLabel =
    transaction.paymentMethod || transaction.paymentType || "UPI";
  const amount = transaction.totalAmount ?? transaction.amount ?? 0;
  const splits = transaction.splits ?? [];
  const hasMultiSplit = Boolean(transaction.hasSplits && splits.length > 1);
  const items = transaction.items ?? [];
  const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const hasActiveSplitFilter = Boolean(
    activeFilters && (activeFilters.categories.length > 0 || activeFilters.purposeId),
  );

  // Which axis actually varies across the split rows names the split type.
  const splitTypeLabel = (() => {
    const purposeCount = new Set(splits.map((split) => split.purposeId)).size;
    const categoryCount = new Set(splits.map((split) => split.categoryId)).size;
    if (purposeCount > 1 && categoryCount > 1) return "Purpose + Category Split";
    if (categoryCount > 1) return "Category Split";
    return "Purpose Split";
  })();

  // Friend Split = a standalone shared bill on this transaction. No outing.
  const friendSplit =
    friendSplits.find((split) => split.transactionId === transaction.id) ?? null;
  const friendSplitMe = friendSplit
    ? getCurrentUserMember(friendSplit.members)
    : undefined;
  const friendSplitPayer = friendSplit
    ? friendSplit.members.find(
        (member) => member.id === friendSplit.paidByMemberId,
      )
    : undefined;
  const friendSplitYourShare =
    friendSplit?.splits.find((split) => split.memberId === friendSplitMe?.id)
      ?.amount ?? 0;
  const friendSplitSettlements = friendSplit
    ? friendSettlements.filter((item) => item.friendSplitId === friendSplit.id)
    : [];
  const friendSplitSettled = friendSplitSettlements.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const rows: Array<{
    key: string;
    label: string;
    icon: typeof Tag;
    value: ReactNode;
  }> = [
    {
      key: "category",
      label: "Category",
      icon: Tag,
      value: transaction.category || "Not set",
    },
    {
      key: "purpose",
      label: "Purpose",
      icon: Target,
      value: purposeLabel,
    },
    {
      key: "account",
      label: "Account",
      icon: Wallet,
      value: accountLabel,
    },
    {
      key: "payment",
      label: "Payment",
      icon: CreditCard,
      value: paymentLabel,
    },
    {
      key: "source",
      label: "Source",
      icon: Landmark,
      value: (
        <Badge variant="secondary">
          {transaction.entrySource || transaction.source || "manual"}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      icon: Hash,
      value: transaction.status || "completed",
    },
    {
      key: "contributor",
      label: "Contributor",
      icon: UserRound,
      value: transaction.contributorSource || "Me",
    },
    {
      key: "reference",
      label: "Reference",
      icon: Hash,
      value: transaction.reference || transaction.referenceId || "Not added",
    },
    {
      key: "note",
      label: "Note",
      icon: StickyNote,
      value: transaction.note || transaction.description || "Not added",
    },
  ];

  return (
    <>
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
                <TypeIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl">{transaction.merchant}</SheetTitle>
                {transaction.title?.trim() ? (
                  <p className="mt-0.5 truncate text-sm font-medium text-muted-foreground">
                    {transaction.title}
                  </p>
                ) : null}
                <SheetDescription className="mt-1 inline-flex items-center gap-2">
                  <CalendarClock className="size-3.5" />
                  {formatDateTime(transactionDateKey(transaction))} · {accountLabel}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-4 rounded-xl border bg-card/80 p-4 backdrop-blur-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {typeMeta.label}
            </p>
            <p
              className={cn(
                "mt-1 text-3xl font-semibold",
                isInvestment
                  ? "text-indigo-600 dark:text-indigo-400"
                  : getTransactionAmountClass(transaction.type),
              )}
            >
              {transaction.type === "expense" ? "-" : "+"}
              {formatCurrency(amount)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                <CategoryIcon className="size-3.5 text-muted-foreground" />
                {transaction.category}
              </span>
              <Badge variant="outline">{purposeLabel}</Badge>
              {isInvestment ? (
                <Badge variant="default">
                  Investment
                </Badge>
              ) : null}
              {transaction.status === "unverified" ? (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold">
                  Unverified
                </Badge>
              ) : null}
            </div>

            {transaction.status === "unverified" ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">Unverified Detected Transaction</p>
                  <p className="mt-0.5 text-amber-800/90 dark:text-amber-400/90 leading-relaxed">
                    Auto-detected via mobile sync. Excluded from confirmed spending and account balances until verified.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5">
          {transaction.outingId ? (
            <div className="grid gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              {isReadOnlyViewer || !linkedOuting ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="size-3.5 text-primary" />
                    {linkedOuting?.name || transaction.merchant || "Outing"}
                  </span>
                </div>
              ) : (
                <Link
                  className="flex items-center justify-between gap-4 transition-colors hover:opacity-90"
                  href={`/outings/${transaction.outingId}`}
                  onClick={() => onOpenChange(false)}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="size-3.5 text-primary" />
                    {linkedOuting.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Open
                    <ExternalLink className="size-3.5" />
                  </span>
                </Link>
              )}
              {!isReadOnlyViewer && onUnlinkOuting ? (
                <Button
                  className="h-8 w-full text-xs cursor-pointer"
                  type="button"
                  variant="outline"
                  onClick={() => setUnlinkDialogOpen(true)}
                >
                  Unlink from outing
                </Button>
              ) : null}
            </div>
          ) : null}

          {rows.map(({ key, label, icon: Icon, value }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3"
            >
              <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-3.5" />
                {label}
              </dt>
              <dd className="max-w-[60%] text-right text-sm font-medium break-words">
                {value}
              </dd>
            </div>
          ))}

          {items.length > 0 ? (
            <div className="rounded-lg border bg-card px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <ShoppingBag className="size-3.5" />
                  Items
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id || `${item.name}-${item.amount}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {item.name}
                      {item.categoryId ? ` · ${item.categoryId}` : ""}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(itemsTotal)}
                </span>
              </div>
            </div>
          ) : null}

          {hasMultiSplit ? (
            <div className="rounded-lg border bg-card px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Split className="size-3.5" />
                  Splits
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {splitTypeLabel}
                </span>
              </div>
              <ul className="space-y-2">
                {splits.map((split) => {
                  const isMatch =
                    hasActiveSplitFilter &&
                    activeFilters &&
                    splitRowMatchesFilters(split, activeFilters, purposes);
                  return (
                    <li
                      key={split.id || `${split.purposeId}-${split.categoryId}-${split.amount}`}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm",
                        isMatch && "bg-primary/10",
                      )}
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
                        {isMatch ? (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                        <span className={cn("truncate", isMatch && "text-foreground")}>
                          {getPurposeDisplayName(split.purposeId, purposes)}
                          {split.categoryId ? ` · ${split.categoryId}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-medium tabular-nums",
                          isMatch && "text-foreground",
                        )}
                      >
                        {formatCurrency(split.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(amount)}
                </span>
              </div>
            </div>
          ) : null}

          {isFriendReturn ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                Friend Repayment Received
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This repayment reduces your net personal spend. It is not counted as earned or taxable income.
              </p>
              <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2 text-xs">
                <span className="text-muted-foreground">Repaid by</span>
                <span className="font-semibold text-foreground">
                  {transaction.merchant?.startsWith("From ")
                    ? transaction.merchant
                    : `From ${transaction.merchant || "Friend"}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Amount returned</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatCurrency(amount)}
                </span>
              </div>
            </div>
          ) : null}

          {friendSplit ? (
            <div className="rounded-lg border bg-card p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Friend Split Details
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                >
                  {friendSplit.members.length} People
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs rounded-md bg-muted/40 p-2.5">
                <div>
                  <dt className="text-muted-foreground">Total Bill</dt>
                  <dd className="font-semibold tabular-nums text-foreground mt-0.5">
                    {formatCurrency(friendSplit.amount || amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid by</dt>
                  <dd className="font-semibold text-foreground mt-0.5">
                    {friendSplitPayer?.name ?? "You"}
                  </dd>
                </div>
                <div className="mt-1">
                  <dt className="text-muted-foreground">Your Share</dt>
                  <dd className="font-semibold tabular-nums text-foreground mt-0.5">
                    {formatCurrency(friendSplitYourShare)}
                  </dd>
                </div>
                <div className="mt-1">
                  <dt className="text-muted-foreground">Total Repaid</dt>
                  <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(friendSplitSettled)} settled
                  </dd>
                </div>
              </dl>

              {/* Members & Repayment status */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">
                  Members & Repayment Status
                </div>
                <div className="space-y-1.5">
                  {friendSplit.members.map((member) => {
                    const memberShare =
                      friendSplit.splits.find((s) => s.memberId === member.id)
                        ?.amount ?? 0;
                    const isPayer = member.id === friendSplit.paidByMemberId;
                    const settledFromMember = friendSplitSettlements
                      .filter((s) => s.fromMemberId === member.id)
                      .reduce((sum, s) => sum + s.amount, 0);
                    const pending = Math.max(0, memberShare - settledFromMember);
                    const isFullySettled = !isPayer && pending <= 0;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {member.name}
                          </span>
                          {isPayer ? (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Payer
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground tabular-nums">
                            Share: {formatCurrency(memberShare)}
                          </span>
                          {!isPayer &&
                            (isFullySettled ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                Settled ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                Owes {formatCurrency(pending)}
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Repayments Received History */}
              {friendSplitSettlements.length > 0 ? (
                <div className="border-t pt-2 space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Repayments Received
                  </div>
                  <div className="space-y-1">
                    {friendSplitSettlements.map((item) => {
                      const fromName =
                        friendSplit.members.find(
                          (m) => m.id === item.fromMemberId,
                        )?.name ?? "Friend";
                      const toName =
                        friendSplit.members.find(
                          (m) => m.id === item.toMemberId,
                        )?.name ?? "You";
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded bg-muted/40 px-2.5 py-1 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {fromName} → {toName}
                            {item.date
                              ? ` · ${new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                              : ""}
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{formatCurrency(item.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isReadOnlyViewer ? (
          <SheetFooter className="border-t px-6 py-4 flex flex-row flex-wrap items-center justify-between gap-2">
            {transaction.status === "unverified" ? (
              <>
                <div className="flex items-center gap-2">
                  {onVerify ? (
                    <Button
                      variant="default"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                      onClick={() => {
                        onVerify(transaction);
                        onOpenChange(false);
                      }}
                    >
                      <Check className="size-4" />
                      Verify
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => onEdit(transaction)}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                </div>
                {onReject ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onReject(transaction);
                      onOpenChange(false);
                    }}
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => onDelete(transaction)}>
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => onEdit(transaction)}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button variant="destructive" onClick={() => onDelete(transaction)}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </>
            )}
          </SheetFooter>
        ) : null}
      </SheetContent>
      </Sheet>

      <UnlinkOutingDialog
        open={unlinkDialogOpen}
        outingName={linkedOuting?.name}
        onConfirm={handleConfirmUnlink}
        onOpenChange={setUnlinkDialogOpen}
      />
    </>
  );
}
