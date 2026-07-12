"use client";

import { Target } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  getActiveTarget,
  getTargetProgress,
} from "@/lib/growth";
import { formatCurrency } from "@/lib/utils";
import type { IncomeTargets } from "@/types";

type IncomeTargetCardProps = {
  targets: IncomeTargets;
  currentIncome: number;
  onSave: (targets: IncomeTargets) => Promise<unknown>;
};

const horizons: Array<{ value: 3 | 6 | 12; label: string }> = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
];

export function IncomeTargetCard({
  targets,
  currentIncome,
  onSave,
}: IncomeTargetCardProps) {
  const [draft, setDraft] = useState(targets);
  const [isSaving, setIsSaving] = useState(false);

  const activeTarget = getActiveTarget(draft);
  const progress = getTargetProgress(currentIncome, activeTarget);

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-primary" />
          Income target
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {horizons.map((horizon) => (
            <button
              key={horizon.value}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                draft.activeHorizon === horizon.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground dark:border-white/10"
              }`}
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  activeHorizon: horizon.value,
                }))
              }
            >
              {horizon.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="3-month target">
            <Input
              inputMode="decimal"
              value={draft.target3Months || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  target3Months: Number(event.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="6-month target">
            <Input
              inputMode="decimal"
              value={draft.target6Months || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  target6Months: Number(event.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="12-month target">
            <Input
              inputMode="decimal"
              value={draft.target12Months || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  target12Months: Number(event.target.value) || 0,
                }))
              }
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Current {formatCurrency(currentIncome)} / Target{" "}
              {formatCurrency(activeTarget)}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <Button className="w-fit" disabled={isSaving} onClick={() => void handleSave()}>
          {isSaving ? "Saving..." : "Save targets"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}