"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
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
  UserRound,
  Users,
  Wallet,
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
    ? outings.find((outing) => outing.id === transaction.outingId)
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
                <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                  Investment
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5">
          {transaction.outingId ? (
            <div className="grid gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Link
                className="flex items-center justify-between gap-4 transition-colors hover:opacity-90"
                href={`/outings/${transaction.outingId}`}
                onClick={() => onOpenChange(false)}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <MapPin className="size-3.5 text-primary" />
                  {linkedOuting?.name ?? "View outing"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Open
                  <ExternalLink className="size-3.5" />
                </span>
              </Link>
              {!isReadOnlyViewer && onUnlinkOuting && canUnlink ? (
                <Button
                  className="h-8 w-full text-xs"
                  type="button"
                  variant="outline"
                  onClick={() => setUnlinkDialogOpen(true)}
                >
                  Unlink
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

          {friendSplit ? (
            <div className="rounded-lg border bg-card px-3 py-3">
              <div className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-3.5" />
                Friend split
              </div>

              <div className="flex flex-wrap gap-1.5">
                {friendSplit.members.map((member) => (
                  <span
                    key={member.id}
                    className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  >
                    {member.name}
                  </span>
                ))}
              </div>

              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Paid by</dt>
                  <dd className="font-medium">
                    {friendSplitPayer?.name ?? "You"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Your share</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(friendSplitYourShare)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Settlements</dt>
                  <dd className="font-medium tabular-nums">
                    {friendSplitSettlements.length === 0
                      ? "None yet"
                      : `${formatCurrency(friendSplitSettled)} settled`}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        {!isReadOnlyViewer ? (
          <SheetFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => onEdit(transaction)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => onDelete(transaction)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
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
