"use client";

import {
  CalendarClock,
  ExternalLink,
  Hash,
  Landmark,
  MapPin,
  Pencil,
  StickyNote,
  Tag,
  Target,
  Trash2,
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
  getInvestmentTypeFields,
  getInvestmentTypeLabel,
  isInvestmentTransaction,
} from "@/lib/investments";
import {
  getCategoryIcon,
  getTransactionAmountClass,
  getTransactionTypeMeta,
} from "@/lib/transaction-ui";
import { useOutings } from "@/hooks/useOutings";
import { useViewerAccess } from "@/providers/viewer-provider";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types";

type TransactionDetailPanelProps = {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
};

const detailFields = [
  { key: "category", label: "Category", icon: Tag },
  { key: "purpose", label: "Purpose", icon: Target },
  { key: "source", label: "Source", icon: Landmark },
  { key: "reference", label: "Reference", icon: Hash },
  { key: "note", label: "Note", icon: StickyNote },
] as const;

export function TransactionDetailPanel({
  transaction,
  open,
  onOpenChange,
  onDelete,
  onEdit,
}: TransactionDetailPanelProps) {
  const { outings } = useOutings();
  const { isReadOnlyViewer } = useViewerAccess();

  if (!transaction) return null;

  const linkedOuting = transaction.outingId
    ? outings.find((outing) => outing.id === transaction.outingId)
    : null;
  const isInvestment = isInvestmentTransaction(transaction);
  const typeMeta = getTransactionTypeMeta(transaction.type);
  const TypeIcon = typeMeta.icon;
  const CategoryIcon = getCategoryIcon(transaction.category);
  const investmentFields = transaction.investmentType
    ? getInvestmentTypeFields(transaction.investmentType)
    : [];

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
                <TypeIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl">{transaction.merchant}</SheetTitle>
                <SheetDescription className="mt-1 inline-flex items-center gap-2">
                  <CalendarClock className="size-3.5" />
                  {formatDateTime(transaction.date)} · {transaction.account}
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
              {formatCurrency(transaction.amount)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                <CategoryIcon className="size-3.5 text-muted-foreground" />
                {transaction.category}
              </span>
              {isInvestment && transaction.investmentType ? (
                <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                  {getInvestmentTypeLabel(transaction.investmentType)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5">
          {isInvestment && transaction.investmentDetails ? (
            <div className="grid gap-2 rounded-lg border bg-card px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Investment details
              </p>
              {investmentFields.map((field) => {
                const value = transaction.investmentDetails?.[field.key];
                if (value === undefined || value === "") return null;
                return (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">{field.label}</span>
                    <span className="font-medium">{String(value)}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {transaction.outingId ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3">
              <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                Linked outing
              </dt>
              <dd className="text-right text-sm font-medium">
                <Link
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  href={`/outings/${transaction.outingId}`}
                  onClick={() => onOpenChange(false)}
                >
                  {linkedOuting?.name ?? "View trip"}
                  <ExternalLink className="size-3.5" />
                </Link>
              </dd>
            </div>
          ) : null}
          {detailFields.map(({ key, label, icon: Icon }) => {
            const value =
              key === "reference" || key === "note"
                ? transaction[key] ?? "Not added"
                : transaction[key];

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-3"
              >
                <dt className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="size-3.5" />
                  {label}
                </dt>
                <dd className="text-right text-sm font-medium">
                  {key === "source" ? (
                    <Badge variant="secondary">{value}</Badge>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            );
          })}
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
  );
}