"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Landmark, Plus, Target, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthReady } from "@/hooks/useAuthReady";
import { invalidateFinancialData } from "@/lib/invalidate-financial-data";
import { completeOnboarding, fetchAppConfig, type OnboardingAccountDraft } from "@/lib/supabase-data";
import type { Account } from "@/types";

/**
 * First-run setup, matching the mobile app's four-step flow:
 *   1. how many accounts   2. per-account details
 *   3. purposes            4. summary / confirm
 *
 * "Skip for now" mirrors mobile: completes with the seeded defaults rather
 * than trapping the user in a wizard they can't leave.
 */

const ACCOUNT_TYPES: { value: Account["type"]; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
  { value: "credit", label: "Credit" },
];

type Draft = OnboardingAccountDraft & { key: string };

function safeUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "d-" + Math.random().toString(36).substring(2, 11);
}

function newDraft(): Draft {
  return {
    key: safeUUID(),
    name: "",
    type: "bank",
    last4: "",
    openingBalance: 0,
  };
}

export function FirstRunOnboardingModal({ open }: { open: boolean }) {
  const { user } = useAuthReady();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [accountCount, setAccountCount] = useState(1);
  const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
  const [familyEnabled, setFamilyEnabled] = useState(true);
  const [customPurposes, setCustomPurposes] = useState<string[]>([]);
  const [purposeInput, setPurposeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const { data: appConfig } = useQuery({
    queryKey: ["app-config"],
    queryFn: fetchAppConfig,
    staleTime: 60 * 1000,
  });

  const maxBankAccounts = Math.max(1, Math.min(20, appConfig?.maxAccountsLimit ?? 8));

  if (!open || completed || !user?.id) return null;

  function applyAccountCount(next: number) {
    const count = Math.max(1, Math.min(maxBankAccounts, next));
    setAccountCount(count);
    setDrafts((current) => {
      if (count <= current.length) return current.slice(0, count);
      const added = Array.from({ length: count - current.length }, () =>
        newDraft(),
      );
      return [...current, ...added];
    });
  }

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  function addCustomPurpose() {
    const name = purposeInput.trim();
    if (!name) return;
    const taken = new Set(
      ["personal", ...(familyEnabled ? ["family"] : []), ...customPurposes].map(
        (p) => p.toLowerCase(),
      ),
    );
    if (taken.has(name.toLowerCase())) {
      setError(`"${name}" already exists.`);
      return;
    }
    setError(null);
    setCustomPurposes((current) => [...current, name]);
    setPurposeInput("");
  }

  function validateAccounts(): string | null {
    const seen = new Set<string>();
    for (const d of drafts) {
      const name = d.name.trim();
      if (!name) return "Give every account a name.";
      const key = name.toLowerCase();
      if (seen.has(key)) return `Two accounts are both called "${name}".`;
      seen.add(key);
      if (!Number.isFinite(d.openingBalance) || d.openingBalance < 0) {
        return `Enter a valid opening balance for "${name}".`;
      }
      const last4 = (d.last4 ?? "").trim();
      // Optional on web — but if given, it has to be real.
      if (last4 && !/^\d{4}$/.test(last4)) {
        return `Last 4 digits for "${name}" must be exactly 4 numbers, or left blank.`;
      }
    }
    return null;
  }

  async function submit(selection: {
    accounts: OnboardingAccountDraft[];
    purposes: string[];
  }) {
    if (!user?.id || isSubmitting) return; // guards double-submit
    setError(null);
    setIsSubmitting(true);
    try {
      await completeOnboarding(user.id, selection);
      await invalidateFinancialData(queryClient, user.id);
      await queryClient.invalidateQueries({ queryKey: ["onboarding", user.id] });
      setCompleted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Couldn't save your setup. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFinish() {
    // Cash is already auto-created by bootstrap — only submit bank accounts
    const bankAccounts = drafts.map(({ name, type, last4, openingBalance }) => ({
      name: name.trim(),
      type,
      last4: (last4 ?? "").trim() || undefined,
      openingBalance,
    }));
    void submit({
      accounts: bankAccounts.length > 0
        ? [{ name: "Cash", type: "cash" as const, openingBalance: 0 }, ...bankAccounts]
        : [{ name: "Cash", type: "cash" as const, openingBalance: 0 }],
      purposes: [...(familyEnabled ? ["Family"] : []), ...customPurposes],
    });
  }

  function handleSkip() {
    // Same as mobile: keep the sane defaults, don't block the user.
    void submit({
      accounts: [{ name: "Cash", type: "cash", openingBalance: 0 }],
      purposes: ["Family"],
    });
  }

  const purposeList = ["Personal", ...(familyEnabled ? ["Family"] : []), ...customPurposes];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="space-y-1 border-b border-border/60 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="size-4 text-primary" /> Set up SpentX
          </h3>
          <p className="text-xs text-muted-foreground">Step {step} of 4</p>
        </div>

        <div className="space-y-4 py-4 text-xs">
          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                <Wallet className="size-3.5 shrink-0" />
                <span><strong>Cash account</strong> is already set up for you.</span>
              </div>
              <p className="text-muted-foreground">
                How many <strong>bank accounts</strong> do you want to add? You can always add more later.
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxBankAccounts }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => applyAccountCount(n)}
                    className={`size-10 rounded-xl border text-xs font-bold transition ${
                      accountCount === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {drafts.map((draft, index) => (
                <div
                  key={draft.key}
                  className="space-y-2.5 rounded-2xl border border-border/60 p-3"
                >
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Account {index + 1}
                  </p>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      placeholder="e.g. HDFC Bank, Cash"
                      value={draft.name}
                      onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Type
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {ACCOUNT_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => updateDraft(draft.key, { type: t.value })}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                            draft.type === t.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                        Last 4 (optional)
                      </Label>
                      <Input
                        maxLength={4}
                        placeholder="5621"
                        value={draft.last4 ?? ""}
                        onChange={(e) => updateDraft(draft.key, { last4: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                        Opening balance
                      </Label>
                      <Input
                        inputMode="decimal"
                        type="number"
                        value={String(draft.openingBalance)}
                        onChange={(e) =>
                          updateDraft(draft.key, {
                            openingBalance: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                Purposes keep separate budgets side by side.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
                <span className="font-semibold text-foreground">Personal</span>
                <span className="text-[10px] uppercase text-muted-foreground">
                  Always on
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFamilyEnabled((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-border/60 px-3 py-2 transition hover:border-primary/50"
              >
                <span className="font-semibold text-foreground">Family</span>
                <span
                  className={`flex size-5 items-center justify-center rounded-md border ${
                    familyEnabled
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {familyEnabled ? <Check className="size-3" /> : null}
                </span>
              </button>

              {customPurposes.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2"
                >
                  <span className="font-semibold text-foreground">{name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      setCustomPurposes((c) => c.filter((p) => p !== name))
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <Input
                  placeholder="Add a purpose (e.g. Business)"
                  value={purposeInput}
                  onChange={(e) => setPurposeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomPurpose();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustomPurpose}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                  <Landmark className="size-3.5" /> Accounts
                </p>
              {/* Cash account (always present) */}
                <div
                  className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                >
                  <span className="font-semibold text-foreground">
                    Cash
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      cash
                    </span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Auto-created</span>
                </div>
                {drafts.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2"
                  >
                    <span className="font-semibold text-foreground">
                      {d.name.trim()}
                      <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                        {d.type}
                      </span>
                    </span>
                    <span className="text-muted-foreground">{d.openingBalance}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                  <Target className="size-3.5" /> Purposes
                </p>
                <p className="rounded-xl border border-border/60 px-3 py-2 font-semibold text-foreground">
                  {purposeList.join(", ")}
                </p>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          {step > 1 ? (
            <Button
              variant="outline"
              className="text-xs"
              disabled={isSubmitting}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="text-xs text-muted-foreground"
              disabled={isSubmitting}
              onClick={handleSkip}
            >
              Skip for now
            </Button>
          )}

          <Button
            className="ml-auto text-xs font-bold"
            disabled={isSubmitting}
            onClick={() => {
              if (step === 2) {
                const problem = validateAccounts();
                if (problem) {
                  setError(problem);
                  return;
                }
              }
              setError(null);
              if (step < 4) setStep((s) => s + 1);
              else handleFinish();
            }}
          >
            {isSubmitting
              ? "Saving..."
              : step === 4
                ? "Finish setup"
                : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
