"use client";

/**
 * Admin SMS rules — two tabs only:
 *  1. Templates — bank SMS parse rules (synced defaults for mobile)
 *  2. Block SMS — OTP / promo / spam ignored on every device
 *
 * Detection/regex training stays on the mobile app for user-specific rules.
 */

import { Ban, Plus, Save, Search, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmsTemplateTagger } from "@/components/admin/SmsTemplateTagger";
import {
  deleteSmsBlockRule,
  deleteSmsTemplateRule,
  fetchSmsBlockRules,
  fetchSmsTemplateRules,
  saveSmsBlockRule,
  saveSmsTemplateRule,
} from "@/lib/supabase-data";
import { cn } from "@/lib/utils";
import type { SmsBlockRule, SmsTemplateRule } from "@/types";

type RuleTab = "template" | "block";

type SmsRulesAdminPanelProps = {
  adminId?: string;
  onNotify: (payload: { title: string; description?: string }) => void;
};

function parseKeywordList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatKeywordList(values: string[]) {
  return values.join(", ");
}

function extractKeywordsFromSample(sample: string): string[] {
  const lower = sample.toLowerCase();
  const candidates = [
    "debited",
    "credited",
    "withdrawn",
    "upi",
    "neft",
    "imps",
    "atm",
    "a/c",
    "rs.",
    "inr",
    "otp",
    "one time password",
    "do not share",
    "verification code",
    "claim now",
    "unsubscribe",
  ];
  return candidates.filter((k) => lower.includes(k));
}

const tabLabels: Record<RuleTab, string> = {
  template: "Templates",
  block: "Block SMS",
};

const tabHints: Record<RuleTab, string> = {
  template:
    "Bank SMS parse templates (AMOUNT / TITLE tokens). Defaults for every phone after refresh.",
  block:
    "OTP, promo, spam — matching SMS never become transactions on any device.",
};

export function SmsRulesAdminPanel({ adminId, onNotify }: SmsRulesAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<RuleTab>("template");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [templateRules, setTemplateRules] = useState<SmsTemplateRule[]>([]);
  const [blockRules, setBlockRules] = useState<SmsBlockRule[]>([]);
  /** null = closed; {} = new paste-and-tag; rule = re-tag existing */
  const [templateTrainer, setTemplateTrainer] = useState<
    SmsTemplateRule | "new" | null
  >(null);
  const [editingBlock, setEditingBlock] = useState<SmsBlockRule | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const [templates, blocks] = await Promise.all([
        fetchSmsTemplateRules(),
        fetchSmsBlockRules(),
      ]);
      setTemplateRules(templates);
      setBlockRules(blocks);
    } catch {
      onNotify({
        title: "Could not load SMS rules",
        description: "Check Supabase connection and admin role.",
      });
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const q = search.trim().toLowerCase();
  const filteredBlock = useMemo(
    () =>
      blockRules.filter((r) =>
        !q
          ? true
          : [r.name, r.pattern, ...(r.keywords ?? [])].join(" ").toLowerCase().includes(q),
      ),
    [blockRules, q],
  );
  const filteredTemplate = useMemo(
    () =>
      templateRules.filter((r) =>
        !q
          ? true
          : [r.bankName, r.type, r.mode, r.templatePattern, ...(r.keywords ?? [])]
              .join(" ")
              .toLowerCase()
              .includes(q),
      ),
    [templateRules, q],
  );

  async function handleSaveTaggedTemplate(
    rule: Omit<SmsTemplateRule, "createdBy" | "createdAt" | "updatedAt">,
  ) {
    setSaving(true);
    try {
      const saved = await saveSmsTemplateRule(
        { ...rule, isActive: rule.isActive ?? true },
        adminId,
      );
      setTemplateRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setTemplateTrainer(null);
      onNotify({
        title: "Template saved",
        description: "Word tags → pattern. Phones pull on next rules refresh.",
      });
    } catch {
      onNotify({
        title: "Failed to save template",
        description: "Check admin permissions and schema.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBlock() {
    if (!editingBlock) return;
    if (!editingBlock.name.trim()) {
      onNotify({ title: "Block rule name is required" });
      return;
    }
    if (!editingBlock.keywords.length && !editingBlock.pattern?.trim()) {
      onNotify({ title: "Add keywords or a regex pattern to block" });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSmsBlockRule(editingBlock, adminId);
      setBlockRules((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setEditingBlock(null);
      onNotify({ title: "Block rule saved — OTP/promo ignored on mobile" });
    } catch {
      onNotify({
        title: "Failed to save block rule",
        description: "Check admin permissions and schema.",
      });
    } finally {
      setSaving(false);
    }
  }

  function startNewBlock() {
    setEditingBlock({
      id: crypto.randomUUID(),
      name: "",
      keywords: ["otp", "one time password"],
      pattern: "",
      sampleMessage: "",
      similarityThreshold: 0.6,
      isActive: true,
    });
  }

  function startNewTemplate() {
    setEditingBlock(null);
    setTemplateTrainer("new");
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 p-5 dark:border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="size-5" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold">SMS rules</CardTitle>
              <CardDescription className="max-w-xl text-xs leading-relaxed">
                Two lists only: <strong>Templates</strong> (how bank SMS become
                transactions) and <strong>Block SMS</strong> (what to ignore). Phones
                pull these as shared defaults.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">
              Templates {templateRules.length}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">
              Block {blockRules.length}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(tabLabels) as RuleTab[]).map((tab) => (
            <Button
              key={tab}
              className={cn(
                "h-8 text-xs font-semibold",
                activeTab === tab
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                setTemplateTrainer(null);
                setEditingBlock(null);
              }}
            >
              {tab === "block" ? <Ban className="mr-1.5 size-3.5" /> : null}
              {tabLabels[tab]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{tabHints[activeTab]}</p>
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder="Search bank, keywords, name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {/* ── TEMPLATES ── */}
        {!loading && activeTab === "template" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Add / Edit opens a popup — paste SMS, tag words, then Save.
              </p>
              <Button
                className="h-9 text-xs font-semibold"
                type="button"
                variant="outline"
                onClick={startNewTemplate}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add template
              </Button>
            </div>

            <RulesTable
              emptyLabel="No templates yet. Seed bank catalog or add one."
              headers={["Bank", "Type", "Mode", "Keywords", "Status", ""]}
              rows={filteredTemplate.map((rule) => ({
                id: rule.id,
                cells: [
                  rule.bankName,
                  rule.type,
                  rule.mode,
                  rule.keywords.join(", ") || "—",
                  <StatusBadge key={`${rule.id}-status`} active={rule.isActive} />,
                ],
                onEdit: () => {
                  setEditingBlock(null);
                  setTemplateTrainer(rule);
                },
                onDelete: async () => {
                  if (!window.confirm(`Delete template for “${rule.bankName}”?`)) {
                    return;
                  }
                  await deleteSmsTemplateRule(rule.id);
                  setTemplateRules((current) =>
                    current.filter((item) => item.id !== rule.id),
                  );
                  onNotify({ title: "Template deleted" });
                },
              }))}
            />
          </>
        ) : null}

        {/* ── BLOCK SMS ── */}
        {!loading && activeTab === "block" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Add / Edit opens a popup card — no scroll away from the list.
              </p>
              <Button
                className="h-9 text-xs font-semibold"
                type="button"
                variant="outline"
                onClick={startNewBlock}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add block rule
              </Button>
            </div>

            <RulesTable
              emptyLabel="No block rules yet. Seed defaults or add OTP/promo blockers."
              headers={["Name", "Keywords", "Threshold", "Status", ""]}
              rows={filteredBlock.map((rule) => ({
                id: rule.id,
                cells: [
                  rule.name,
                  rule.keywords.join(", ") || "—",
                  String(rule.similarityThreshold),
                  <StatusBadge key={`${rule.id}-status`} active={rule.isActive} />,
                ],
                onEdit: () => {
                  setTemplateTrainer(null);
                  setEditingBlock(rule);
                },
                onDelete: async () => {
                  if (!window.confirm(`Delete block rule “${rule.name}”?`)) return;
                  await deleteSmsBlockRule(rule.id);
                  setBlockRules((current) =>
                    current.filter((item) => item.id !== rule.id),
                  );
                  onNotify({ title: "Block rule deleted" });
                },
              }))}
            />
          </>
        ) : null}
      </CardContent>

      {/* ── Template add/edit popup ── */}
      <Dialog
        open={templateTrainer != null}
        onOpenChange={(open) => {
          if (!open) setTemplateTrainer(null);
        }}
      >
        <DialogContent
          className="flex max-h-[min(92vh,900px)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle>
              {templateTrainer === "new" || !templateTrainer
                ? "Add SMS template"
                : `Edit template · ${templateTrainer.bankName || "rule"}`}
            </DialogTitle>
            <DialogDescription>
              Paste a bank SMS, tag each word (Amount, Title, Card last4…), then Save.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {templateTrainer != null ? (
              <SmsTemplateTagger
                key={
                  templateTrainer === "new"
                    ? "new-template"
                    : templateTrainer.id
                }
                embedded
                existing={templateTrainer === "new" ? null : templateTrainer}
                saving={saving}
                onCancel={() => setTemplateTrainer(null)}
                onSave={(rule) => void handleSaveTaggedTemplate(rule)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Block add/edit popup ── */}
      <Dialog
        open={editingBlock != null}
        onOpenChange={(open) => {
          if (!open) setEditingBlock(null);
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,720px)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle>
              {editingBlock?.name ? `Edit block · ${editingBlock.name}` : "Add block rule"}
            </DialogTitle>
            <DialogDescription>
              OTP / promo / spam keywords. Matching SMS never become transactions.
            </DialogDescription>
          </DialogHeader>
          {editingBlock ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <Field label="Sample SMS to block (optional)">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs"
                  placeholder="Your OTP is 482910. Do not share with anyone."
                  value={editingBlock.sampleMessage ?? ""}
                  onChange={(event) => {
                    const sample = event.target.value;
                    setEditingBlock((current) => {
                      if (!current) return current;
                      const next = { ...current, sampleMessage: sample };
                      if (!current.keywords.length && sample.trim()) {
                        next.keywords = extractKeywordsFromSample(sample);
                      }
                      if (!current.name.trim() && sample.trim()) {
                        next.name = "OTP / verification";
                      }
                      return next;
                    });
                  }}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rule name">
                  <Input
                    placeholder="OTP block, Promo SMS…"
                    value={editingBlock.name}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </Field>
                <Field label="Similarity threshold (0–1)">
                  <Input
                    inputMode="decimal"
                    max={1}
                    min={0}
                    step={0.1}
                    type="number"
                    value={editingBlock.similarityThreshold}
                    onChange={(event) =>
                      setEditingBlock((current) =>
                        current
                          ? {
                              ...current,
                              similarityThreshold: Number(event.target.value) || 0,
                            }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Keywords (comma-separated)">
                <Input
                  placeholder="otp, one time password, do not share"
                  value={formatKeywordList(editingBlock.keywords)}
                  onChange={(event) =>
                    setEditingBlock((current) =>
                      current
                        ? {
                            ...current,
                            keywords: parseKeywordList(event.target.value),
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Regex pattern (optional)">
                <Input
                  className="font-mono text-xs"
                  placeholder="otp|one.?time.?password"
                  value={editingBlock.pattern ?? ""}
                  onChange={(event) =>
                    setEditingBlock((current) =>
                      current ? { ...current, pattern: event.target.value } : current,
                    )
                  }
                />
              </Field>
              <ActiveToggle
                checked={editingBlock.isActive}
                onCheckedChange={(checked) =>
                  setEditingBlock((current) =>
                    current ? { ...current, isActive: checked } : current,
                  )
                }
              />
            </div>
          ) : null}
          <div className="flex shrink-0 gap-2 border-t border-border bg-muted/40 px-5 py-3">
            <Button
              className="h-9"
              disabled={saving}
              type="button"
              onClick={() => void handleSaveBlock()}
            >
              <Save className="mr-1.5 size-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              className="h-9"
              type="button"
              variant="outline"
              onClick={() => setEditingBlock(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ActiveToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium">Active (synced to mobile)</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      className={cn(
        "text-[10px] uppercase",
        active
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

function RulesTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: Array<{
    id: string;
    cells: ReactNode[];
    onEdit: () => void;
    onDelete: () => Promise<void>;
  }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header || "actions"} className="text-[10px] uppercase">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.cells.map((cell, index) => (
                <TableCell key={`${row.id}-${index}`} className="max-w-[220px] truncate text-xs">
                  {cell}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap text-right">
                <Button
                  className="h-8 px-2 text-xs"
                  type="button"
                  variant="ghost"
                  onClick={row.onEdit}
                >
                  Edit
                </Button>
                <Button
                  className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                  type="button"
                  variant="ghost"
                  onClick={() => void row.onDelete()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
