"use client";

import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Reflection } from "@/types";

const moodOptions = [
  { value: 1, emoji: "😫", label: "Stressed" },
  { value: 2, emoji: "😕", label: "Uneasy" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😊", label: "Great" },
];

const reflectionSchema = z.object({
  mood: z.number().min(1).max(5),
  wins: z.string().min(3, "Share at least a short win"),
  unnecessarySpend: z.string().min(3, "Describe one unnecessary spend"),
  planAdherenceNote: z.string().optional(),
  differentNextWeek: z.string().min(3, "Add one change for next week"),
  standoutTransactions: z.string().optional(),
});

type ReflectionFormValues = z.infer<typeof reflectionSchema>;

type ReflectionFormProps = {
  weekStart: string;
  planAdherence: number;
  standoutTransactions: string[];
  initialValues?: Reflection | null;
  isSubmitting?: boolean;
  onSubmit: (values: ReflectionFormValues) => Promise<void>;
};

export function ReflectionForm({
  planAdherence,
  standoutTransactions,
  initialValues,
  isSubmitting,
  onSubmit,
}: ReflectionFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<ReflectionFormValues>({
    resolver: zodResolver(reflectionSchema),
    defaultValues: {
      mood: initialValues?.mood ?? 3,
      wins: initialValues?.wins ?? "",
      unnecessarySpend: initialValues?.unnecessarySpend ?? "",
      planAdherenceNote: initialValues?.planAdherenceNote ?? "",
      differentNextWeek: initialValues?.differentNextWeek ?? "",
      standoutTransactions:
        initialValues?.standoutTransactions ??
        standoutTransactions.join("\n"),
    },
  });

  const mood = watch("mood");

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-2">
        <Label>Mood this week</Label>
        <div className="flex flex-wrap gap-2">
          {moodOptions.map((option) => (
            <button
              key={option.value}
              className={cn(
                "inline-flex min-w-24 flex-col items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                mood === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40 dark:border-white/10",
              )}
              type="button"
              onClick={() =>
                setValue("mood", option.value, { shouldValidate: true })
              }
            >
              <span className="text-xl">{option.emoji}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        {errors.mood ? (
          <p className="text-sm text-destructive">{errors.mood.message}</p>
        ) : null}
      </div>

      <Field error={errors.wins?.message} label="Biggest win this week">
        <Textarea rows={3} {...register("wins")} />
      </Field>

      <Field
        error={errors.unnecessarySpend?.message}
        label="Biggest unnecessary spend + why"
      >
        <Textarea rows={3} {...register("unnecessarySpend")} />
      </Field>

      <div className="rounded-lg border bg-muted/15 p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Plan adherence</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Auto-calculated from your monthly plan and this week&apos;s spending.
            </p>
          </div>
          <p className="text-3xl font-semibold text-teal-600 dark:text-teal-400">
            {planAdherence}%
          </p>
        </div>
        <div className="mt-3">
          <Label htmlFor="plan-note">Your note on plan adherence</Label>
          <Textarea
            className="mt-2"
            id="plan-note"
            placeholder="Optional context on how you felt about staying on plan..."
            rows={2}
            {...register("planAdherenceNote")}
          />
        </div>
      </div>

      <Field
        error={errors.differentNextWeek?.message}
        label="One thing I will do differently next week"
      >
        <Textarea rows={3} {...register("differentNextWeek")} />
      </Field>

      <Field
        label="Standout transactions (optional)"
        hint="Pre-filled from your highest spends this week. Edit freely."
      >
        <Textarea rows={3} {...register("standoutTransactions")} />
      </Field>

      <Button className="w-fit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving reflection..." : "Save reflection"}
      </Button>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}