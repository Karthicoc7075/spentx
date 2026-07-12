"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarClock,
  IndianRupee,
  Landmark,
  LineChart,
  Plus,
  StickyNote,
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
import { useAccounts } from "@/hooks/useAccounts";
import {
  getInvestmentTypeFields,
  getInvestmentTypeLabel,
  investmentTypeOptions,
  type InvestmentFormValues,
} from "@/lib/investments";
import { cn, formatCurrency } from "@/lib/utils";
import type { InvestmentDetailType } from "@/types";

const investmentSchema = z.object({
  amount: z.preprocess(
    (value) => Number(value),
    z.number().positive("Amount is required"),
  ),
  date: z.string().min(1, "Date is required"),
  account: z.string().min(1, "Account is required"),
  note: z.string().optional(),
  investmentType: z.enum([
    "mutual-fund",
    "stocks",
    "gold-etf",
    "physical-gold",
    "fd",
    "ppf-epf",
    "crypto",
    "other",
  ]),
  details: z.record(z.string(), z.union([z.string(), z.number()])),
});

type InvestmentFormInput = z.input<typeof investmentSchema>;
type InvestmentFormOutput = z.output<typeof investmentSchema>;

type AddInvestmentSlideOverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InvestmentFormValues) => Promise<void>;
};

const fieldInputClassName =
  "h-10 w-full min-w-0 rounded-lg px-3.5 py-2.5 text-sm dark:bg-input/30";

const fieldSelectClassName =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const accent = {
  border: "border-indigo-500/30",
  icon: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  text: "text-indigo-600 dark:text-indigo-400",
  button:
    "bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:hover:bg-indigo-500/90",
  preview: "from-indigo-500/15 via-indigo-500/5 to-transparent",
};

export function AddInvestmentSlideOver({
  open,
  onOpenChange,
  onSubmit,
}: AddInvestmentSlideOverProps) {
  const { accounts: allAccounts } = useAccounts();
  const accounts = allAccounts.filter((account) => account.is_active !== false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<InvestmentFormInput, unknown, InvestmentFormOutput>({
    resolver: zodResolver(investmentSchema),
    defaultValues: {
      amount: 0,
      date: new Date().toISOString().slice(0, 16),
      account: "",
      note: "",
      investmentType: "mutual-fund",
      details: {},
    },
  });

  const amount = watch("amount");
  const investmentType = watch("investmentType");
  const details = watch("details") ?? {};
  const typeFields = getInvestmentTypeFields(investmentType);

  useEffect(() => {
    if (!open) return;
    reset({
      amount: 0,
      date: new Date().toISOString().slice(0, 16),
      account: accounts[0]?.name ?? "",
      note: "",
      investmentType: "mutual-fund",
      details: {},
    });
  }, [accounts, open, reset]);

  useEffect(() => {
    const nextDetails: Record<string, string | number> = {};
    for (const field of getInvestmentTypeFields(investmentType)) {
      nextDetails[field.key] = "";
    }
    setValue("details", nextDetails);
  }, [investmentType, setValue]);

  async function submit(values: InvestmentFormOutput) {
    const fields = getInvestmentTypeFields(values.investmentType);
    const missingField = fields.find((field) => {
      if (!field.required) return false;
      const value = values.details[field.key];
      return value === undefined || value === "" || value === 0;
    });

    if (missingField) {
      setDetailError(`${missingField.label} is required`);
      return;
    }

    setDetailError(null);
    await onSubmit({
      amount: Number(values.amount),
      date: values.date,
      account: values.account,
      note: values.note,
      investmentType: values.investmentType,
      details: values.details,
    });
    reset();
    onOpenChange(false);
  }

  const previewName =
    typeFields
      .map((field) => details[field.key])
      .find((value) => typeof value === "string" && value.trim()) ??
    getInvestmentTypeLabel(investmentType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <div
          className={cn(
            "border-b bg-gradient-to-br px-6 pb-5 pt-6",
            accent.preview,
            accent.border,
          )}
        >
          <SheetHeader className="p-0 text-left">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  accent.icon,
                )}
              >
                <LineChart className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl">Add Investment</SheetTitle>
                <SheetDescription className="mt-1">
                  Record wealth-building activity with detailed investment metadata.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {Number(amount) > 0 ? (
            <div
              className={cn(
                "mt-4 rounded-xl border bg-card/80 p-4 backdrop-blur-sm",
                accent.border,
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <p className={cn("mt-1 text-3xl font-semibold", accent.text)}>
                -{formatCurrency(Number(amount) || 0)}
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {String(previewName)} · {getInvestmentTypeLabel(investmentType)}
              </p>
            </div>
          ) : null}
        </div>

        <form className="grid gap-6 px-6 py-5" onSubmit={handleSubmit(submit)}>
          <section className="grid gap-4">
            <div>
              <p className="text-sm font-medium">Basic transaction info</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Amount, date, and the account funding this investment.
              </p>
            </div>

            <Field error={errors.amount?.message} icon={IndianRupee} label="Amount">
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className={cn(
                    fieldInputClassName,
                    "pl-10 pr-3.5 text-base font-medium",
                  )}
                  inputMode="decimal"
                  placeholder="0.00"
                  {...register("amount")}
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field error={errors.date?.message} icon={CalendarClock} label="Date">
                <Input
                  className={cn(
                    fieldInputClassName,
                    "[color-scheme:light] dark:[color-scheme:dark]",
                  )}
                  type="datetime-local"
                  {...register("date")}
                />
              </Field>

              <Field error={errors.account?.message} icon={Landmark} label="Account">
                <select className={fieldSelectClassName} {...register("account")}>
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.name}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field icon={StickyNote} label="Note (optional)">
              <Textarea
                className="min-h-20 px-3.5 py-3 text-sm dark:bg-input/30"
                placeholder="Add context for this investment..."
                {...register("note")}
              />
            </Field>
          </section>

          <section className="grid gap-4 rounded-xl bg-muted/15 p-4 dark:bg-white/[0.02]">
            <div>
              <p className="text-sm font-medium">Investment details</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose an investment type and fill in the relevant fields.
              </p>
            </div>

            <Field icon={LineChart} label="Investment type">
              <select
                className={fieldSelectClassName}
                {...register("investmentType")}
                onChange={(event) => {
                  const value = event.target.value as InvestmentDetailType;
                  setValue("investmentType", value);
                }}
              >
                {investmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {detailError ? (
              <p className="text-xs text-destructive">{detailError}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {typeFields.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <Label className="text-sm">
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </Label>
                  <Input
                    className={fieldInputClassName}
                    inputMode={field.type === "number" ? "decimal" : "text"}
                    placeholder={field.placeholder ?? field.label}
                    value={details[field.key] ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const value =
                        field.type === "number"
                          ? raw === ""
                            ? ""
                            : Number(raw)
                          : raw;
                      setValue("details", { ...details, [field.key]: value });
                    }}
                  />
                </div>
              ))}
            </div>
          </section>

          <SheetFooter className="border-t px-0 pt-4">
            <Button
              className={cn("h-10 w-full sm:w-auto", accent.button)}
              disabled={isSubmitting}
              type="submit"
            >
              <Plus className="size-4" />
              Add investment
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  children,
  error,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  error?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="inline-flex items-center gap-2 text-sm">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="relative">{children}</div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}