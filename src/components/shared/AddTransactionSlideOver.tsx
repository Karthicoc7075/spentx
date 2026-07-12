"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CalendarClock,
  Hash,
  IndianRupee,
  Landmark,
  StickyNote,
  Store,
  Tag,
  Target,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PersonalizedSuggestion } from "@/components/shared/PersonalizedSuggestion";
import { useAccounts } from "@/hooks/useAccounts";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useCategories } from "@/hooks/useCategories";
import { useContributors } from "@/hooks/useContributors";
import { usePurposes } from "@/hooks/usePurposes";
import { getActivePurposes, isHomeFamilyPurpose } from "@/lib/purposes";
import { useTransactions } from "@/hooks/useTransactions";
import { getTransactionTip } from "@/lib/ai/personalizedSuggestions";
import { findLikelyDuplicate } from "@/lib/transaction-summary";
import {
  getCategoryIcon,
  getTransactionTypeMeta,
  transactionTypeMeta,
} from "@/lib/transaction-ui";
import { INVESTMENT_CATEGORY } from "@/lib/investments";
import { cn, formatCurrency } from "@/lib/utils";
import type { ContributorSource, Transaction } from "@/types";

const transactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  amount: z.preprocess(
    (value) => Number(value),
    z.number().positive("Amount is required"),
  ),
  merchant: z.string().min(2, "Merchant is required"),
  category: z.string().min(1, "Category is required"),
  account: z.string().min(1, "Account is required"),
  purpose: z.string().min(1, "Purpose is required"),
  date: z.string().min(1, "Date is required"),
  reference: z.string().optional(),
  note: z.string().optional(),
  contributorSource: z.string().optional(),
});

type TransactionFormValues = z.input<typeof transactionSchema>;
type ParsedTransactionFormValues = z.output<typeof transactionSchema>;

type AddTransactionSlideOverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: Transaction["type"];
  initialValues?: Transaction;
  onSubmit: (values: Omit<Transaction, "id">) => Promise<void>;
  onDelete?: (transaction: Transaction) => Promise<void>;
  onInvestmentCategorySelected?: () => void;
};

const fieldInputClassName =
  "h-10 w-full min-w-0 rounded-lg px-3.5 text-sm shadow-none";

const fieldSelectClassName =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function AddTransactionSlideOver({
  open,
  onOpenChange,
  mode = "expense",
  initialValues,
  onSubmit,
  onDelete,
  onInvestmentCategorySelected,
}: AddTransactionSlideOverProps) {
  const { accounts } = useAccounts();
  const { settings } = useUserSettings();
  const { categories: allCategories } = useCategories();
  const { purposes } = usePurposes();
  const activePurposes = getActivePurposes(purposes);
  const { transactions } = useTransactions();
  const { contributors, defaultContributorName } = useContributors();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<TransactionFormValues, unknown, ParsedTransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    values: {
      type: initialValues?.type ?? mode,
      amount: initialValues?.amount ?? 0,
      merchant: initialValues?.merchant ?? "",
      category: initialValues?.category ?? "",
      account: initialValues?.account ?? settings.defaultAccount ?? "",
      purpose: initialValues?.purpose ?? activePurposes[0]?.id ?? "",
      // Always defaults to "Me" — a Brother/Father contributor is only
      // something the user explicitly picks.
      contributorSource: initialValues?.contributorSource ?? defaultContributorName,
      date:
        initialValues?.date.slice(0, 16) ??
        new Date().toISOString().slice(0, 16),
      reference: initialValues?.reference ?? "",
      note: initialValues?.note ?? "",
    },
  });

  const currentType = watch("type");
  const amount = watch("amount");
  const merchant = watch("merchant");
  const category = watch("category");
  const selectedPurpose = watch("purpose");
  // Only worth showing the picker once there's more than one contributor to
  // choose between — with just "Me" configured, income is always hers/his.
  const showContributorSource =
    currentType === "income" &&
    isHomeFamilyPurpose(selectedPurpose, activePurposes) &&
    contributors.length > 1;
  const typeMeta = getTransactionTypeMeta(currentType);
  const categories = allCategories.filter(
    (item) =>
      item.type === currentType &&
      (item.is_active !== false || item.name === initialValues?.category),
  );
  const selectableAccounts = accounts.filter(
    (item) => item.is_active !== false || item.name === initialValues?.account,
  );
  const selectedCategoryColor =
    categories.find((item) => item.name === category)?.color ?? "#8b7ff0";
  const CategoryIcon = getCategoryIcon(category);
  const transactionTip =
    currentType === "expense"
      ? getTransactionTip(category, merchant, transactions)
      : null;

  const [duplicateMatch, setDuplicateMatch] = useState<Transaction | null>(null);
  const [pendingValues, setPendingValues] =
    useState<ParsedTransactionFormValues | null>(null);

  useEffect(() => {
    if (!open) {
      setDuplicateMatch(null);
      setPendingValues(null);
    }
  }, [open]);

  async function commitSubmit(values: ParsedTransactionFormValues) {
    await onSubmit({
      ...values,
      source: "manual",
      date: new Date(values.date).toISOString(),
      amount: Number(values.amount),
      contributorSource: showContributorSource
        ? (values.contributorSource as ContributorSource | undefined)
        : undefined,
      outingId: initialValues?.outingId ?? undefined,
    });
    setDuplicateMatch(null);
    setPendingValues(null);
    reset();
    onOpenChange(false);
  }

  async function submit(values: ParsedTransactionFormValues) {
    // Spec A1.1 — soft duplicate warning runs only on create, never on edit.
    if (!initialValues) {
      const duplicate = findLikelyDuplicate(
        {
          amount: Number(values.amount),
          account: values.account,
          date: new Date(values.date).toISOString(),
        },
        transactions,
      );

      if (duplicate) {
        setDuplicateMatch(duplicate);
        setPendingValues(values);
        return;
      }
    }

    await commitSubmit(values);
  }

  function minutesAgoLabel(iso?: string) {
    if (!iso) return "recently";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.max(0, Math.round(diffMs / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.round(hours / 24)} day(s) ago`;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {/* Header */}
        <div className="border-b border-border px-6 pb-5 pt-6">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-xl font-semibold tracking-tight">
              {initialValues
                ? "Edit transaction"
                : currentType === "expense"
                  ? "Add expense"
                  : "Add income"}
            </SheetTitle>
            <SheetDescription className="mt-1">
              {initialValues
                ? "Update the transaction details below."
                : typeMeta.sheetDescription}
            </SheetDescription>
          </SheetHeader>
        </div>

        <form className="grid gap-5 px-6 py-5" onSubmit={handleSubmit(submit)}>
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {(["expense", "income"] as const).map((type) => {
              const meta = transactionTypeMeta[type];
              const Icon = meta.icon;
              const isActive = currentType === type;

              return (
                <label
                  key={type}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold transition-colors",
                    isActive
                      ? cn("bg-card shadow-sm", meta.accent.text)
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    value={type}
                    {...register("type")}
                  />
                  <Icon className="size-4" />
                  {meta.label}
                </label>
              );
            })}
          </div>

          {/* Amount hero */}
          <div
            className={cn(
              "rounded-2xl border p-5 transition-colors",
              typeMeta.accent.border,
              typeMeta.accent.surface,
            )}
          >
            <Label
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="transaction-amount"
            >
              Amount
            </Label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={cn("text-2xl font-bold", typeMeta.accent.text)}>
                {currentType === "expense" ? "−" : "+"}
              </span>
              <IndianRupee
                className={cn("size-6 shrink-0", typeMeta.accent.text)}
              />
              <Input
                className="h-12 flex-1 border-0 bg-transparent p-0 text-3xl font-bold tracking-tight shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                id="transaction-amount"
                inputMode="decimal"
                placeholder="0"
                {...register("amount")}
              />
            </div>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {Number(amount) > 0 || merchant
                ? `${currentType === "expense" ? "−" : "+"}${formatCurrency(Number(amount) || 0)} · ${merchant || "Merchant"} · ${category || "Category"}`
                : "Enter the transaction amount."}
            </p>
            {errors.amount?.message ? (
              <p className="mt-1.5 text-xs text-destructive">
                {errors.amount.message}
              </p>
            ) : null}
          </div>

          {/* Main fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              className="sm:col-span-2"
              error={errors.merchant?.message}
              icon={Store}
              label="Merchant"
            >
              <Input
                className={fieldInputClassName}
                list="merchant-suggestions"
                placeholder="Amazon, Uber, Salary..."
                {...register("merchant")}
              />
              <datalist id="merchant-suggestions">
                {["Amazon", "Uber", "Big Basket", "Acme Payroll", "Spotify"].map(
                  (item) => (
                    <option key={item} value={item} />
                  ),
                )}
              </datalist>
            </Field>

            <Field error={errors.category?.message} icon={Tag} label="Category">
              <select
                className={fieldSelectClassName}
                {...register("category")}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === INVESTMENT_CATEGORY &&
                    currentType === "expense" &&
                    !initialValues &&
                    onInvestmentCategorySelected
                  ) {
                    onOpenChange(false);
                    onInvestmentCategorySelected();
                    return;
                  }
                  void register("category").onChange(event);
                }}
              >
                <option value="">Select category</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
              {category ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: selectedCategoryColor }}
                  />
                  <CategoryIcon className="size-3.5" />
                  {category}
                </div>
              ) : null}
            </Field>

            <Field error={errors.account?.message} icon={Landmark} label="Account">
              <select className={fieldSelectClassName} {...register("account")}>
                <option value="">Select account</option>
                {selectableAccounts.map((account) => (
                  <option key={account.id} value={account.name}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              className={showContributorSource ? "" : "sm:col-span-2"}
              error={errors.purpose?.message}
              icon={Target}
              label="Purpose"
            >
              <select className={fieldSelectClassName} {...register("purpose")}>
                <option value="">Select purpose</option>
                {activePurposes.map((purpose) => (
                  <option key={purpose.id} value={purpose.id}>
                    {purpose.name}
                  </option>
                ))}
              </select>
            </Field>

            {showContributorSource ? (
              <Field icon={Users} label="Income contributor">
                <select
                  className={fieldSelectClassName}
                  {...register("contributorSource")}
                >
                  {contributors.map((contributor) => (
                    <option key={contributor.id} value={contributor.name}>
                      {contributor.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>

          {transactionTip ? (
            <PersonalizedSuggestion compact suggestion={transactionTip} />
          ) : null}

          {/* Payment details */}
          <section className="grid gap-4 rounded-2xl bg-muted/50 p-5">
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Payment details
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                When it happened, plus an optional UPI reference.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                error={errors.date?.message}
                icon={CalendarClock}
                label="Date & time"
              >
                <Input
                  className={cn(
                    fieldInputClassName,
                    "bg-background",
                    "[color-scheme:light] dark:[color-scheme:dark]",
                    "[&::-webkit-calendar-picker-indicator]:ml-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100",
                  )}
                  type="datetime-local"
                  {...register("date")}
                />
              </Field>

              <Field icon={Hash} label="UPI / Reference">
                <Input
                  className={cn(fieldInputClassName, "bg-background")}
                  placeholder="e.g. name@upi"
                  {...register("reference")}
                />
              </Field>
            </div>
          </section>

          {/* Note */}
          <Field icon={StickyNote} label="Note">
            <Textarea
              className="min-h-24 rounded-lg px-3.5 py-3 text-sm shadow-none"
              placeholder="Add context for this transaction..."
              {...register("note")}
            />
          </Field>

          {duplicateMatch ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Similar transaction exists
                  </p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    {formatCurrency(duplicateMatch.amount)} · {duplicateMatch.merchant} ·{" "}
                    {duplicateMatch.account} ·{" "}
                    {new Date(duplicateMatch.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/70">
                    Added {minutesAgoLabel(duplicateMatch.createdAt)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      className="border-amber-300 bg-transparent text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/15"
                      onClick={() => {
                        setDuplicateMatch(null);
                        setPendingValues(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (pendingValues) void commitSubmit(pendingValues);
                      }}
                    >
                      Save anyway
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-border px-0 pt-5">
            {initialValues && onDelete ? (
              <Button
                disabled={isSubmitting}
                type="button"
                variant="destructive"
                onClick={() =>
                  void onDelete(initialValues).then(() => onOpenChange(false))
                }
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button
              className={cn("flex-1 sm:flex-none sm:px-8", typeMeta.accent.button)}
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Saving..."
                : initialValues
                  ? "Update transaction"
                  : `Save ${currentType}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  children,
  className,
  error,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  className?: string;
  error?: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
